const config = require("./config")

const API_URL = `https://eth-mainnet.alchemyapi.io/v2/${config.alchemyKey}`
const PUBLIC_KEY_LIST = config.publicKey
const PRIVATE_KEY_LIST = config.privateKey
const NICK_NAME_LIST = config.nickName
const MAX_PRIORITY_FEE_PER_GAS = config.maxPriority
const MAX_FEE_PER_GAS = config.maxGasPrice
const MULTIPLE_GAS = config.multipleGas

const {createAlchemyWeb3} = require("@alch/alchemy-web3")
const web3 = createAlchemyWeb3(API_URL)

const moment = require("moment");

// 获取时间
const getDate = () => {
  let date = moment(new Date()).utcOffset(8).format('YYYY-MM-DD HH:mm:ss.SSS');
  return date
}
// 休眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms));
};


// 初始化
let date = getDate()
console.log(`\n${date} 归集程序启动...\n`)
// address-tokenIdList的map
let addressTokenIdMap = new Map()

//获取单地址NFT余额 并将16进制的tokenId存入Map
async function getNFTBalance(contract, address) {
  const nfts = await web3.alchemy.getNfts({owner: address, contractAddresses: contract})
  if (nfts.totalCount == 0) {
    return nfts.totalCount
  }
  console.log("\nnumber of NFTs found:", nfts.totalCount);
  let tokenIdList = []
  for (const nft of nfts.ownedNfts) {
    // 16进制转10进制
    let tokenIdDec = parseInt(nft.id.tokenId, 16)  
    console.log("token ID:", tokenIdDec);
    // 保存16进制的tokenId到数组
    let tokenIdHex = nft.id.tokenId
    tokenIdList.push(tokenIdHex)
  }
  addressTokenIdMap.set(address, tokenIdList)
  let addressNftBalance = nfts.totalCount
  return addressNftBalance
}

// 循环获取所有地址的NFT余额
const getAllNFTBalance = async (contract) => {
  let allNftBalance = 0
  for (let i = 0; i < PUBLIC_KEY_LIST.length; i++) {
    let address = PUBLIC_KEY_LIST[i]
    let name = NICK_NAME_LIST[i]
    contract = [contract]
    let nftBalance = await getNFTBalance(contract, address)
    if (nftBalance !== 0) {
      console.log(`${address} ${name} NFT balance: ${nftBalance}`)   
      allNftBalance += nftBalance
    }
  }
  console.log(`NFT ${contract} \nALL Address balance: ${allNftBalance}`) 
  return allNftBalance
}

// 通过accounts循环获取NFT余额 
const getNFTBalanceByAccounts = async (contract, accounts) => {
  let allNftBalance = 0
  for (let i = 0; i < accounts; i++) {
    let address = PUBLIC_KEY_LIST[i]
    let name = NICK_NAME_LIST[i]
    contract = [contract]
    let nftBalance = await getNFTBalance(contract, address)
    if (nftBalance !== 0) {
      console.log(`${address} ${name} NFT balance: ${nftBalance}`)   
      allNftBalance += nftBalance
    }
  }
  console.log(`NFT ${contract} \nALL Address balance: ${allNftBalance}`)
  // 打印地址tokenId Map 
  // for (let [key, value] of addressTokenIdMap) {
  //      console.log(`${key} ${value}`)
  // } 
  return allNftBalance
}

// 获取转移nft的十六进制数据(safeTransferFrom)
const getInputData = async (fromAddress, toAddress, tokenId) => {
  fromAddress = fromAddress.toLowerCase()
  toAddress = toAddress.toLowerCase()
  let inputData = `0x42842e0e000000000000000000000000${fromAddress.slice(2)}000000000000000000000000${toAddress.slice(2)}${tokenId.slice(2)}`
  // console.log(`inputData: ${inputData}`);
  return inputData
}

// 转移NFT
async function transferNFT(publicKey, privateKey, contract, toAddress, tokenId) {
  const nonce = await web3.eth.getTransactionCount(publicKey, "latest")
  inputData = await getInputData(publicKey, toAddress, tokenId)

  let tx = {
    from: publicKey,
    to: contract,
    nonce: nonce,
    value: 0,
    input: inputData,
    type: '0x2',
    maxPriorityFeePerGas: web3.utils.toHex(web3.utils.toWei(MAX_PRIORITY_FEE_PER_GAS, 'gwei')),
    maxFeePerGas: web3.utils.toHex(web3.utils.toWei(MAX_FEE_PER_GAS, 'gwei')),
  }
  // 计算gas和避开失败的交易
  let gas = await web3.eth.estimateGas(tx)
  tx.gas = parseInt(MULTIPLE_GAS * gas)

  // sign the transaction
  const signPromise = web3.eth.accounts.signTransaction(tx, privateKey)
  signPromise
    .then((signedTx) => {
      web3.eth.sendSignedTransaction(
        signedTx.rawTransaction,
        function (err, hash) {
          if (!err) {
            console.log("The hash of your transaction is: ", hash)
          } else {
            console.log("Something went wrong when submitting your transaction:", err)
          }
        }
      )
    })
    .catch((err) => {
      console.log("Promise failed:", err)
    })
}

// 归集nft
async function collectNFT(contract, toAddress, accounts) { 
  if (accounts == 0) {
    accounts = PUBLIC_KEY_LIST.length;
  } else if (accounts > PUBLIC_KEY_LIST.length) {
    accounts = PUBLIC_KEY_LIST.length;
  }
  let allNftBalance = await getNFTBalanceByAccounts(contract, accounts)
  if (allNftBalance == 0) {
    console.log(`\n没有可以归集的NFT 请检查合约地址是否准确\n`)
    return
  }
  console.log(`\n开始归集...\n`)
  for (let i = 0; i < accounts; i++) {
    let address = PUBLIC_KEY_LIST[i]
    let name = NICK_NAME_LIST[i]
    let tokenIdList = addressTokenIdMap.get(address)
    if (tokenIdList.length == 0) {
      console.log(`${address} ${name} 没有可以归集的NFT`)
      continue
    }
    for (let j = 0; j < tokenIdList.length; j++) {
      let tokenId = tokenIdList[j]
      await transferNFT(address, PRIVATE_KEY_LIST[i], contract, toAddress, tokenId).catch((err) => {
        console.log(`${address} ${name} 归集NFT失败 \n${err}`)
      })
      if (j < tokenIdList.length - 1) {
        await sleep(60000);
      }
    }
  }
  await sleep(10000);
  console.log(`\n归集完成\n`)
}

const startRun = async () => {
  
  if (process.argv.length < 3) {
    console.log(`\n请输入合约地址和归集账户数\n`)
    return
  } 
  // 查询NFT库存
  else if (process.argv.length == 3) {
    args = process.argv.slice(2);
    let contractAddress = args[0];
    await getAllNFTBalance(contractAddress)  
  }
  else if (process.argv.length == 4) {
    args = process.argv.slice(2);
    let contractAddress = args[0];
    let toAddress = config.collectAddress;
    let accounts = args[1];
    collectNFT(contractAddress, toAddress, accounts);
  }
  else {
    console.log(`\n参数错误\n`)
  }
}

startRun()