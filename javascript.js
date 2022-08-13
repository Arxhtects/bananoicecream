import bs58 from "https://cdn.skypack.dev/bs58@5.0.0"; 
import multiformats from 'https://cdn.skypack.dev/multiformats';
import { CID } from 'https://cdn.skypack.dev/multiformats/cid';
import axios from "https://cdn.skypack.dev/axios@0.27.2";

const bananoJs = window.bananocoinBananojs;
bananoJs.setBananodeApiUrl('https://kaliumapi.appditto.com/api');

const bananoUtil = bananoJs.bananoUtil;

//ban_1rp1aceaawpub5zyztzs4tn7gcugm5bc3o6oga16bb18bquqm1bjnoomynze
let testAddress = "ban_3i9hw6xuiqwgnkbmszyadubsynjysntsw6tkk98tg7qfj3f8nwzaqtkc5pw3";
let spyGlassAPI = "https://api.spyglass.pw/banano";
let connectedReps;

const abortControl = new AbortController();
const timeoutId = setTimeout(() => abortControl.abort(), 1000);
const loadingText = $("#loadingText").attr("data-text");
//Todo: Cache
//-cookies

//get current online representatives for  for valid accounts
async function getReps() {
  try {
    let response = await axios.get('https://api.spyglass.pw/banano/v1/representatives/online', {signal: abortControl.signal});
    connectedReps = response['data'];
    //console.log(connectedReps);
  } catch (error) {
    doError(error);
  }
  clearTimeout(timeoutId);
}

getReps();

//

function doError(error) {
  //todo magical stuff
  $("#error > p").text(error);
  $("#error").addClass("show");
  setTimeout(removeError, 5000);
  console.error(error);
}

function removeError() {
  $("#error").removeClass("show");
}

function validateAccount(account) {
  return bananoJs.getBananoAccountValidationInfo(account)["valid"];
}

async function getBlockHeight(account) {
  let data = await bananoJs.getAccountInfo(account);
  return data['confirmation_height'];
}

function covertCID(account) {
  let data = bananoJs.getAccountPublicKey(account);
  data = bs58.encode(bananoUtil.hexToBytes('1220' + data));
  data = CID.parse(data);
  data = data.toString();
  return data;
}


async function getHistroy(account) { 
  let headerOptions = {receive_only: false, send_only: false, from: false}; //size: false receive_only/send_only/from
  try {
    let response = await axios.post('https://api.spyglass.pw/banano/v2/account/confirmed-transactions', {address: account, size: String(headerOptions.count) }, {signal: abortControl.signal});
    const data = response['data'];
    return data;
  } catch(error) {
    doError(error);
  }
  clearTimeout(timeoutId);
}

async function getPending(account) { 
  try {
    let response = await axios.post('https://api.spyglass.pw/banano/v1/account/receivable-transactions', {address: account}, {signal: abortControl.signal});
    const data = response['data'];
    return data;
  } catch(error) {
    doError(error);
  }
  clearTimeout(timeoutId);
}

async function getJsonfromCID(cid) { //test: QmdaZCaeg8EfhZAsAaNd6BopGo7GVoYYrG8YhUwwiZKWPN
  let response;
  try {//https://gateway.pinata.cloud/ipfs/ or https://ipfs.io/ipfs/
    response = await axios.get('https://ipfs.io/ipfs/' + cid, {timeout: 1000});
  } catch(error) {
    //doError(error);
    return false;
  }
  clearTimeout(timeoutId);
  return response['data'];
}

async function getAccountHistory(account) {
  // receive_only: false, send_only: false, count: 5000, from: false, offset: false 
  let options = { count: 500 }; 
  let packet = {
    address: account,
    size: String(options.count)
  };
  
  let response = await axios.post('https://api.spyglass.pw/banano/v2/account/confirmed-transactions', packet);
  //console.log(response['data']);
  return response['data'];
}

async function validCIDaccount(account) { //Possibly pointless
  if(connectedReps.includes(account)) {
    //do something with return TODO.
    return false;
  }
  let jsonCID = await getJsonfromCID(covertCID(account));
  if (!jsonCID) {
    //console.log('empty');
    return false;
  }
  //console.log(jsonCID);
  return jsonCID;
}

async function getBlockHashes(hashes) {
  let remainingHashes;
  let remainingResponseHashes;
  let response;
  let responseHashes;
  try {
    if(hashes.length > 200) {
      remainingHashes = hashes.slice(200, hashes.length);
      hashes = hashes.slice(0, 200);
    }
    try {
      response = await axios.post('https://api.spyglass.pw/banano/v1/blocks', {blocks: hashes}, {signal: abortControl.signal});
      responseHashes = response['data'];
      if(remainingHashes && remainingHashes > 0) {
        remainingResponseHashes = await getBlockHashes(remainingHashes); //this fells wrong
        responseHashes = responseHashes.concat(remainingResponseHashes);
      }
      return responseHashes;
     } catch(error) {
      doError(error);
    }
  } catch(error) {
    doError(error);
    return false;
  }
  clearTimeout(timeoutId);
}

async function getBlockHash(hash) {
  let response;
  try {
    response = await axios.get('https://api.spyglass.pw/banano/v1/block/' + hash, {signal: abortControl.signal});
   } catch(error) {
    doError(error);
  }
  clearTimeout(timeoutId);
  return response['data'];
}

async function getSupplyRepBlock(hash) {
  let supplyBlock = await getBlockHash(hash);
  let supplyRep = supplyBlock.contents['representative'];
  let getpublickey = bananoJs.getAccountPublicKey(supplyRep);
  return {getpublickey, supplyBlock}
}

//Supply limitations
async function supplyLimit(supplyHash, blockHeight) {
  let differenceInHeight;
  let supplyData = await getSupplyRepBlock(supplyHash);
  const defineSupply = parseInt(supplyData[1].slice(48, 64), 16);
  if(defineSupply === 0) { //coercion
    return true;
  }
  differenceInHeight = blockHeight - supplyData[0]['height'];
  if(differenceInHeight <= defineSupply) {
    return true;
  } else {
    return false;
  }
}

async function getPendingNFTBlocks(account) {
  let response = await getPending(account);
  return response['data'];
  //idk do some magic not thought this one through yet.
}

//magic 
async function getNFTBlocksForAccount(account) {
  let getBlockheight = await getBlockHeight(account);
  let validateInformation = bananoJs.getBananoAccountValidationInfo(account);
  const nftBlocks = [];
  const nftMeta = [];
  let accHistroy;
  let hashes;
  let hashesSendBlocks;
  let sendBlocksLinked;
  let blockFollow;
  
  if(!validateInformation['valid']) {
    //do error
    return false;
  }
  try {
    accHistroy = await getAccountHistory(account);
  } catch(error) {
    doError(error);
    return nftBlocks;
  }
  hashes = accHistroy.map((data)=> data['hash']);
  //hashes = hashes.reverse();
  //console.log(hashes);
  accHistroy = await getBlockHashes(hashes);
  hashesSendBlocks = accHistroy.filter((data)=> data['subtype'] == 'receive');
  let reciveTypes = hashesSendBlocks; //grab em
  hashesSendBlocks = hashesSendBlocks.map((data)=> data.contents['link']);
  sendBlocksLinked = await getBlockHashes(hashesSendBlocks);
  //console.log(sendBlocksLinked);
  //document.body.innerHTML = JSON.stringify(reciveTypes, null, 4); //remove after testing
  for(let i = 0; i < accHistroy.length; i++) {
    let indexSendHash;
    let sendBlock;
    let representative;
    let blockHeight;
    let cidJson;
    if(accHistroy[i]['subtype'] == 'receive') {
      indexSendHash = hashesSendBlocks.indexOf(accHistroy[i].contents['link']);
      sendBlock = sendBlocksLinked[indexSendHash];
      representative = sendBlock.contents['representative'];
      blockHeight = sendBlock['height'];
      cidJson = await validCIDaccount(representative);
      //console.log(cidJson);
      if(cidJson !== false) {
        let issuerAddress = cidJson['properties']['issuer'];
        
          const filterItem = issuerAddress;

          const filterList = sendBlocksLinked;
          const filterRecive = reciveTypes;

          var filterdReciveBlocks = filterRecive.filter(e => e['sourceAccount'].includes(filterItem));
          var filterSendBlocks = filterList.filter(e => e['blockAccount'].includes(filterItem));
          //console.log(filterSendBlocks[0].amount);
          nftBlocks.push(filterdReciveBlocks, filterSendBlocks);
          nftMeta.push(cidJson);
        //push cidJson to buildpage
        //sendBlocksLinked
        //document.body.innerHTML += JSON.stringify(cidJson, null, 4); //remove after testing
      }
    }
  }
  //push cidJson to buildpage for metadata
  //console.log(nftBlocks);
  buidPage(nftBlocks, nftMeta);
  return nftBlocks;
}
//ban_3i9hw6xuiqwgnkbmszyadubsynjysntsw6tkk98tg7qfj3f8nwzaqtkc5pw3

function buidPage(nftBlocks, nftMeta) {
  if(nftBlocks.length >= 1) {
    for(let i = 0; i < nftBlocks.length; i++) {
      //console.log(nftBlocks[i].length);
      //console.log(nftBlocks[i]);
      if(nftBlocks[i].length >= 2) {
        //$("#data > .wrapper").append("<div>" + JSON.stringify(nftBlocks[i]) + "</div>");
        for(let d = 0; d < nftBlocks[i].length; d++) {
          $("#data > .wrapper").append("<div>" + JSON.stringify(nftBlocks[i][d]) + "</div>");
        }
      } else {
        $("#data > .wrapper").append("<div>" + JSON.stringify(nftBlocks[i]) + "</div>");
      }
      //$("#data > .wrapper").append("<div>" + JSON.stringify(nftBlocks[i]) + "</div>");
    }
    for(let i = 0; i < nftMeta.length; i++) {
      //console.log(nftBlocks[i][0].amount);
      console.log(nftMeta[i]);
      $("#data > .wrapper").append("<div>" + JSON.stringify(nftMeta[i]) + "</div>");
    }
    var seen = {};
    $('#data > .wrapper > div').each(function() {
      var txt = $(this).text();
      if (seen[txt]) {
          $(this).remove();
      } else {
          seen[txt] = true;
      }
    });
    $('body').addClass('show-data');
    $("#data").addClass("show");
    let timerId = setTimeout(function tick() {
        $('body').removeClass('z-index');
        $('body').removeClass('load-data');
      }, 2000);
  }
}


async function checkUrl() {
    let response;
    var dataItems = document.getElementsByClassName('check');
    for(var i = 0; i < dataItems.length; i++) {
      var url = dataItems[i].getAttribute('data-url');
      try {
        response = await axios.get(url, {timeout: 1000});
        response = response['status'];
      } catch(error) {
        response = error.response['status'];
      }
      if(response == 0) {
        dataItems[i].classList.add("unknown");
      } else if(response !== 503 || response !== 504) {
        dataItems[i].classList.add("active");
      }
    }
}

//TODO BREAK IT DAMN IT
function loadingLoop(str) {
  let copy = str.split(",");
  function loop() {
    const random = Math.floor(Math.random() * copy.length);
    $("#loadingText").text(copy[random]);

    setTimeout(loop, 3000);
  }
  loop();
}

//load check
$(document).ready(function() {

  $('#click').on('click', function() {
    var val = $(this).siblings().val();
    if(val.indexOf('ban_') >= 0) {
      //TODO Check if valid acc, unless ive already written that in the main function .. probably
      $('body').addClass('z-index');
      $('body').addClass('load-data');
      loadingLoop(loadingText);
      getNFTBlocksForAccount(val);
      console.log('wait a sec');
    } else {
      doError("Thats not a valid Banano address. You need to input a valid Address for this to work.")
    }
  });
});

$('.switch').on("click", function() {
  $('body').toggleClass('darkmode');
});

$('.data-header > div > a').on("click", function() {
  var value = $(this).attr('href');
  $('.data-header > div > a').removeClass('active');
  $(this).addClass('active');
});

checkUrl();