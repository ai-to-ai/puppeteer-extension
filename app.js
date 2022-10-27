var fs = require("fs");
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const repl = require('puppeteer-extra-plugin-repl')({ addToPuppeteerClass: false })
const express = require("express");
const app = express();
var socketServer = require('http').createServer(app);
var io = require('socket.io')(socketServer);
const cors = require('cors');
const bodyParser = require('body-parser')
const readline = require('readline')
const PromisePool = require('es6-promise-pool');
const wordsSimilarity = require('words-similarity');
const path = require("path");
const formidable = require('formidable');
const config = require('./config/index.json')
const dbCodeTable = require('./database/db_code.json')
const dbAlterDescTable = require('./database/db_alter_desc.json')
const dbDescTable = require('./database/db_desc.json')

const SCRAPE_ONLY = 0
const COMPARE_ONLY = 1
const SCRAPE_COMPARE = 2
const ADD_TO_QUE = 3
const SCRAPE_QUE = 4

const LOG_PC= 0
const LOG_PS = 1
const LOG_COMPARE = 2
const LOG_COMPARE_FILTER = 3
const LOG_IBC = 4
const LOG_ADD_QUE = 5
const LOG_START_FROM_QUE = 6
const LOG_FINISH_FROM_QUE = 7
const LOG_REMOVE = 8
const LOG_ALL = 9

const QUE_ADD = 0
const QUE_REMOVE = 1
const QUE_ALL = 2

const CONFIG_FILTER_ADD = 0
const CONFIG_FILTER_REMOVE = 1
const CONFIG_INGORE_ADD = 2
const CONFIG_IGNORE_REMOVE = 3


puppeteer.use(StealthPlugin())
puppeteer.use(repl)
app.use(cors())
app.use(bodyParser.json({limit:'64mb'}))
app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));

let log
try {
  // log = fs.readFileSync(__dirname+"\\"+ config.TEMP_DIR_NAME + "\\" + config.LOG_FILE_NAME + ".txt")
  log = fs.readFileSync(path.join(__dirname,config.TEMP_DIR_NAME,config.LOG_FILE_NAME+".log"))
  log = JSON.parse(log)
} catch (err) {
  log = []
}

/* Listen for socket connection on port 8080 */
socketServer.listen(8080, function(){
  console.log('Socket server listening on : 8080');
});

io.on('connection', function(socket){

  socket.emit('log',{log:log.slice(0,10), total:log.length});

  socket.on('log', function(data){
    let page = parseInt(data.page)
    let perPage = parseInt(data.perPage)
    let total = log.length
    let result = log.slice((page-1) * perPage, page*perPage)
    socket.emit('log',{log:result, total:total});
  });
});


// partsouq.csv save and create compare.csv
app.post('/scrape',async(req,res)=>{

  let {vin, ref, customerName, dueDate, cmpType, allowDuplicate, actionType, descChange} = req.body;
  let pcScrapeData = req.body.data || ""

  if((vin === 'undefined') || 
    ( ref === 'undefined') || 
    ( customerName === 'undefined') || 
    ( dueDate === 'undefined') || 
    ( cmpType === 'undefined') || 
    ( allowDuplicate === 'undefined') || 
    ( actionType === 'undefined') ) {

      res.status(400).json({data:"Please check the current page."});
      return;
  }
  console.log(handType)

  ref = ref.replace("_","#")
  actionType = parseInt(actionType)
  try {
    switch (actionType){
      case SCRAPE_ONLY: 
          logHandler(LOG_START_FROM_QUE, ref, vin, customerName, dueDate)
          savePCData(ref, vin, customerName, dueDate, pcScrapeData);
          await scrapePS(ref, vin, customerName, dueDate);
          logHandler(LOG_FINISH_FROM_QUE, ref, vin, customerName, dueDate)
          break;
      case COMPARE_ONLY:
          logHandler(LOG_START_FROM_QUE, ref, vin, customerName, dueDate)
          if(descChange) savePCData(ref, vin, customerName, dueDate, pcScrapeData);
          compare(ref, vin,customerName, dueDate, cmpType, allowDuplicate);
          logHandler(LOG_FINISH_FROM_QUE, ref, vin, customerName, dueDate)
          break;
      case SCRAPE_COMPARE:
          logHandler(LOG_START_FROM_QUE, ref, vin, customerName, dueDate)
          savePCData(ref, vin, customerName, dueDate, pcScrapeData);
          await scrapePS(ref, vin, customerName, dueDate);
          compare(ref, vin, customerName, dueDate, cmpType, allowDuplicate);
          logHandler(LOG_FINISH_FROM_QUE, ref, vin, customerName, dueDate)
          break;
      case ADD_TO_QUE: 
        queHandler(QUE_ADD, ref, vin,customerName, dueDate, pcScrapeData);
        break;
      case SCRAPE_QUE:
        scrapeQue(cmpType, allowDuplicate);
        break;
    }
  } catch (err){
    console.log(err)
    io.emit('err', {err:"Request Error\n"+err.message})
  }
  res.json({data:"Request process finished."})
})

app.post("/scrape_handtype", async(req,res) => {
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
      console.log(fileds)
    });

  let handData = req.body.data
  let vin = req.body.vin
  let brand = req.body.brand
  let allowDuplicate = req.body.allowDuplicate
  let cmpType = req.body.cmpType
  let actionType =req.body.actionType
  try {

    switch (actionType){
      case SCRAPE_ONLY: 
          savePCData("","","","",handData,true)
          await scrapePS("",vin,"","", false,true)
          break;
      case COMPARE_ONLY:
          compare("", vin,"", "", cmpType, allowDuplicate, true);
          break;
      case SCRAPE_COMPARE:
          savePCData("","","","",handData,true)
           await scrapePS("",vin,"","", false,true)
          compare("", vin,"", "", cmpType, allowDuplicate, true);
          break;
    }
  } catch(err) {
    console.log(err)
    io.emit("err", {err:"Scrapping by handtype list \n"+err.message})
  }
  

})

app.post('/scrape_ps', async(req,res)=> {
  try {
    scrapePS("",req.body.vin,"","",true)    
  } catch(err) {
    res.status(400).json({data:"Please check vin again."})
  }
  res.json({data:"Scrape request finished for "+ req.vin})
})

// create database from current invoice page
app.post('/create_db_from_page',async (req,res) =>{

  const {urls, cookie} = req.body

  let cookies = [];

  cookie.split(/\s*;\s*/).forEach(function(pair) {
    let output ={}
    pair = pair.split(/\s*=\s*/);
    output.name = pair[0]
    output.value = pair.splice(1).join('=');
    if(output.name == "PHPSESSID"){
      output.domain = "v1.partscheck.com.au"
    } else output.domain = ".partscheck.com.au"
    output.path = "/"
    cookies.push(output)
  });

  let dbScrapeData = await scrapeInvoiceUrls(urls, cookies)

  try {
    // fs.appendFileSync(__dirname+"\\database\\"+config.DB_NAME+".csv", dbScrapeData)
    fs.appendFileSync(path.join(__dirname,"database",config.DB_NAME+".csv"), dbScrapeData)
    console.log("Database saved.")
  } catch(err){
    console.log(err)
    res.status(400).json({data:"Cannot create database."})
    return 
  }
  res.json({data:"Creating db from page request finished."})  
})

// create database from invoice list.
app.post("/create_db_from_list",async(req,res) => {
  let start = new Date().getTime()
  const {cookie} = req.body

  const invoiceUrls = config.INVOICE_URLS
  
  const cookies = [];

  cookie.split(/\s*;\s*/).forEach(function(pair) {
    let output ={}
    pair = pair.split(/\s*=\s*/);
    output.name = pair[0]
    output.value = pair.splice(1).join('=');
    if(output.name == "PHPSESSID"){
      output.domain = "v1.partscheck.com.au"
    } else output.domain = ".partscheck.com.au"
    output.path = "/"
    cookies.push(output)
  });

  let urls = []

  const browser = await puppeteer.launch({ headless: true });

  if(invoiceUrls.length > 0) {
    for(let i = 0; i < invoiceUrls.length; i++){
      try {
        console.log("URL preparing.. "+ (i*100/invoiceUrls.length).toFixed(1)+ "%")
        const page = await browser.newPage();
        await page.setCookie(...cookies)
        page.setDefaultNavigationTimeout(0); 

        // go to website and wait for page
        console.log(invoiceUrls[i])
        await page.goto(invoiceUrls[i]);

        await page.waitForSelector("body");

        var aTags = await page.$$eval("tr[style='color:'] > td > a", els => els.map(el => document.location.href.split("fees-invoice-report")[0] + el.getAttribute("href")))

        urls.push(...aTags)

        await page.close()
      } catch (err){
        console.log(err)
      }
    }

    let dbScrapeData = await scrapeInvoiceUrls(urls, cookies)
    try {
      fs.appendFileSync(path.join(__dirname,"database",config.DB_NAME+".csv"), dbScrapeData);
      // fs.appendFileSync(__dirname+"\\database\\"+config.DB_NAME+".csv", dbScrapeData);
      console.log("Database with List saved.")
    } catch(err){
      console.log(err)
      res.status(400).json({data: "Creating DB from list not completed."})
      return
    }
    
    let end = new Date().getTime()

    console.log(getExecTime(end-start))

    res.status(200).json({data: "Creating DB from list is finished."})
  }
})

// process database
app.post("/process_db", async(req,res) => {
  processDb()
})

app.post("/remove_from_que", async(req,res) => {
    let {ref, vin} = req.body
    if(ref === undefined || vin === undefined) {
      res.status(400).json({data:"Please check the page"})
      return
    }
    try {
      queHandler(QUE_REMOVE, ref, vin)
    } catch(err) {
      res.status(400).json({data: err.message})
    }
    
    res.json({data:"Removed from Que."})
})


app.post("/remove_from_log", async(req,res) => {
    let {ref, vin} = req.body
    if(ref === undefined || vin === undefined) {
      res.status(400).json({data:"Please check the page"})
      return
    }
    try {
      logHandler(LOG_REMOVE, ref, vin)
    } catch(err) {
      res.status(400).json({data: err.message})
      return
    }
    
    res.json({data:"Removed from Log."})
})

app.post("/get_all_que", (req, res) => {
  let que = []
  let {page, perPage} = req.body
  let total = 0
  try {
    que = queHandler(QUE_ALL).map((el, i) => {
      let newEl = {}
      newEl.ref = el.ref
      newEl.vin = el.vin
      newEl.csName = el.csName
      newEl.dueDate = el.dueDate
      newEl.row = i
      return newEl
    })
    total = que.length
    que = que.slice((page-1)*perPage, page*perPage)
    
  } catch(err){
    return res.status(400).json({data:err.message})
   }
  res.status(200).json({que:que, total:total})
})

app.post("/get_all_log", (req, res) => {
  let log_all = []
  let {page, perPage} = req.body
  let total = 0
  try {
    log_all = logHandler(LOG_ALL).map((el, i) => {
      let newEl = el
      newEl.row = i
      return newEl
    })
    total = log_all.length
    log_all = log_all.slice((page-1)*perPage, page*perPage)

    io.emit('log',{log:log_all, total})
  } catch(err){
    return res.status(400).json({data:err.message})
   }
  res.status(200).json({log:log_all, total:total})
})

app.post("/modify_config", (req,res) => {
  let {brand,catText, subCat, actionType} = req.body

  if(brand === undefined || catText === undefined || subCat === undefined || actionType === undefined ) {
    res.status(400).json({data:"Please check again."})
    return
  }
  try {
    let modifyConfig = fs.readFileSync(path.join(__dirname,"config","index.json"))
    // let modifyConfig = fs.readFileSync(__dirname + "\\config\\index.json")
    let data = JSON.parse(modifyConfig)

    if(parseInt(actionType) == CONFIG_FILTER_ADD){
      if(!data.SCRAPE_TARGET[brand])  {
        data.SCRAPE_TARGET[brand] = {}
      }
      let brandData = data.SCRAPE_TARGET[brand]

      if(!brandData[catText]) {
        brandData[catText] = []
      }

      let category = brandData[catText]
      
      let idx = category.findIndex(el => el == subCat)
      if(idx < 0 ) {
        category.push(subCat)
      }
    } else if (parseInt(actionType) == CONFIG_FILTER_REMOVE){
      if(data.SCRAPE_TARGET[brand] && data.SCRAPE_TARGET[brand][catText]){

        let idx = data.SCRAPE_TARGET[brand][catText].findIndex(el => el == subCat)
        if(idx >= 0) {
          data.SCRAPE_TARGET[brand][catText].splice(idx, 1)
          if(data.SCRAPE_TARGET[brand][catText].length == 0) {
            delete data.SCRAPE_TARGET[brand][catText]
            if(JSON.stringify(data.SCRAPE_TARGET[brand]) === "{}") {
              delete data.SCRAPE_TARGET[brand]
            }
          }
        }
      }
    } else if (parseInt(actionType) == CONFIG_INGORE_ADD) {
      if(!data.SCRAPE_TARGET[brand])  {
        data.SCRAPE_TARGET[brand] = {}
      }
      let brandData = data.SCRAPE_TARGET[brand]

      if(!brandData[(catText+"_X")]) {
        brandData[(catText+"_X")] = []
      }

      let category = brandData[(catText+"_X")]
      
      let idx = category.findIndex(el => el == subCat)
      if(idx < 0 ) {
        category.push(subCat)
      }    
    } else if ( parseInt(actionType) == CONFIG_IGNORE_REMOVE) {
        if(data.SCRAPE_TARGET[brand] && data.SCRAPE_TARGET[brand][(catText+"_X")]){

          let idx = data.SCRAPE_TARGET[brand][(catText+"_X")].findIndex(el => el == subCat)
          if(idx >= 0) {
            data.SCRAPE_TARGET[brand][(catText+"_X")].splice(idx, 1)
            if(data.SCRAPE_TARGET[brand][(catText+"_X")].length == 0) {
              delete data.SCRAPE_TARGET[brand][(catText+"_X")]
              if(JSON.stringify(data.SCRAPE_TARGET[brand]) === "{}") {
                delete data.SCRAPE_TARGET[brand]
              }
            }
          }
        }
    }

    let result = JSON.stringify(data)
    result = result.replace(/\,/ig,",\n")
    fs.writeFileSync(path.join(__dirname,"config","index.json"), result)
    // fs.writeFileSync(__dirname + "\\config\\index.json", result)
    console.log("Config "+(actionType? "Added":"Removed")+" Brand ==>"+brand +" Category==>"+catText + " SubCategory ==>"+ subCat)
  } catch (err) {
    console.log(err)
    io.emit('err',{err:"Config Modification Error\n"+err.message})
  }
  res.json({data:"Config change request finished"})
})

function compare(ref = "23256", vin = "6T1BF3FK70X006743", customerName = "", dueDate = "", cmpType=2, allowDuplicate = true, isHandType = false){
  ref = ref.replace("_","#")

  let pcFilePath = path.join(__dirname,config.RESULT_DIR_NAME,ref +"_"+ vin,config.PC_FILE_NAME + '.csv')
  // let pcFilePath = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ vin + "\\"+config.PC_FILE_NAME + '.csv'
  let cmpFilePath = path.join(__dirname, config.RESULT_DIR_NAME,ref +"_"+ vin,config.COMPARE_FILE_NAME + '.csv')
  // let cmpFilePath = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ vin + "\\"+config.COMPARE_FILE_NAME + '.csv'
  let cmpFilterFilePath = path.join(__dirname, config.RESULT_DIR_NAME, ref +"_"+ vin, config.COMPARE_FILTER_FILE_NAME + '.csv')
  // let cmpFilterFilePath = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ vin + "\\"+config.COMPARE_FILTER_FILE_NAME + '.csv'
  let processDbPath = path.join(__dirname ,config.DATABASE_DIR_NAME, config.PROCESS_DB_NAME + '.csv')
  // let processDbPath = __dirname + "\\database\\" + config.PROCESS_DB_NAME + '.csv'
  let psFilePath = path.join(__dirname, config.RESULT_DIR_NAME,ref +"_"+ vin, config.PS_FILE_NAME + '.csv')
  // let psFilePath = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ vin + "\\"+config.PS_FILE_NAME + '.csv'

  let handTypeFilePath = path.join(__dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME, config.HANDTYPE_LIST_FILE_NAME+".csv")
  // let handTypeFilePath = __dirname + "\\" +config.RESULT_DIR_NAME + "\\handtype\\list.csv"
  let handTypePSPath = path.join(__dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME, config.PS_FILE_NAME+".csv")
  // let handTypePSPath = __dirname + "\\" + config.RESULT_DIR_NAME + "\\handtype\\"+config.PS_FILE_NAME+".csv"
  let handTypeCmpFilePath = path.join(__dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME ,config.COMPARE_FILE_NAME + ".csv")
  // let handTypeCmpFilePath = __dirname + "\\" + config.RESULT_DIR_NAME + "\\handtype\\" + config.COMPARE_FILE_NAME + ".csv"
  let handTypeCmpFilterFilePath = path.join( __dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME, config.COMPARE_FILE_NAME + ".csv")
  // let handTypeCmpFilterFilePath = __dirname + "\\" + config.RESULT_DIR_NAME + "\\handtype\\" + config.COMPARE_FILE_NAME + ".csv"


  const pcFile = fs.readFileSync(isHandType?handTypeFilePath:pcFilePath, 'utf-8');
  const psFile = fs.readFileSync(isHandType?handTypePSPath:psFilePath, 'utf-8');

  let cmpData = "Line,PC Desc,PC Number,PC Code(setting),PS Desc,PS Number,PS Code,PS Code(setting),Qty,Matched,Logic Number, Score, DB desc, PC duplicate, Filter Status\n"
  let cmpFilterData = []
  let start = new Date().getTime()

  let total = pcFile.split(/\r?\n/).length
  pcFile.split(/\r?\n/).forEach((pcRow, pcIndex) =>  {
    if(!pcRow.includes("Row") && pcRow !=""){
      console.log("Comparing: " + (pcIndex*100/total).toFixed(1) + "%")

      let pcDesc = pcRow.split(",")[1] || ""
      let pcNumber = pcRow.split(",")[2] || ""
      let pcBrand = pcRow.split(",")[3] || ""

      if(!(pcDesc == "" && pcNumber == "" && pcBrand == "")) 
      {
        let pcCodeSetting = getCode(pcBrand, pcNumber) || ""

        let pcData =  pcDesc + ","
                + pcNumber + ","
                + pcCodeSetting;

        if(cmpType == 1){
          let data = ""

          psFile.split(/\r?\n/).forEach(psRow =>  {
            let psNumber = psRow.split(",")[2] || ""
            let psDesc = psRow.split(",")[3] || ""
            let psCode = psRow.split(",")[4] || ""
            let psQty = psRow.split(",")[5] || ""
            let psCodeSetting = getCode(pcBrand, psNumber) || ""
            
            if(psCodeSetting == pcCodeSetting && pcCodeSetting != "" && psDesc != ""){
              
              data = pcIndex +","
                  + pcData + ","
                  + psDesc + ","
                  + psNumber + ","
                  + psCode + ","
                  + psCodeSetting + ","
                  + psQty + ","
                  + (psNumber == pcNumber) 
                  + "\n"
            }
          })

          cmpData += data

        } else if(cmpType == 2) {

          let psData = []
          let pcCodeSettings = []
          let possibleRows = 0
          let cmpRowData = ""
          let notBlank = false

          let codesFromDesc = dbDescTable[getCleanString(pcDesc)]

          if(codesFromDesc){

            codesFromDesc.sort(function(a, b){return b.score - a.score})
            pcCodeSettings = codesFromDesc.filter(el => el.brand == pcBrand)

            // L1
            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, pcCodeSettings, 1, cmpRowData)
            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow +"\n"
                possibleRows++
              })

              notBlank = true
            }

            // L2
            let altStringCodes = dbAlterDescTable[getSameString(pcDesc)] || []


            altStringCodes = altStringCodes.filter(el => el.brand == pcBrand)
            // console.log(getSameString(pcDesc))
            altStringCodes.sort(function(a, b){return b.score - a.score})
            psData = []
            psData = checkPartsouq(pcDesc, psFile,ref, vin,pcNumber, pcBrand, altStringCodes, 2,cmpRowData)
            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            // L3
            let descPermutationCodes = []
            permuteShift(getCleanString(pcDesc)).forEach(permutedDesc => {
              // console.log(permutedDesc)
              if(dbDescTable[permutedDesc]){
                descPermutationCodes  = descPermutationCodes.concat(dbDescTable[permutedDesc])
              }
            })

            descPermutationCodes = descPermutationCodes.filter(el => el.brand == pcBrand)
            descPermutationCodes.sort(function(a, b){return b.score - a.score})
            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, descPermutationCodes, 3,cmpRowData)
            
            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            // L4
            let descAltPermutationCodes = []
            permuteShift(getSameString(pcDesc)).forEach(permutedDesc => {
              if(dbAlterDescTable[permutedDesc])
                descAltPermutationCodes = descAltPermutationCodes.concat(dbAlterDescTable[permutedDesc])
            })
            descAltPermutationCodes = descAltPermutationCodes.filter(el => el.brand == pcBrand)
            descAltPermutationCodes.sort(function(a, b){return b.score - a.score})
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, descAltPermutationCodes, 4,cmpRowData)
            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            } 

             // L5
             let codesForOthers = codesFromDesc.filter(el => el.brand != pcBrand ).slice(0,config.LOGIC_LIMITS["L5"])

            let newDescs_L5 = []
            codesForOthers.forEach(elCode => {
              if(dbCodeTable[elCode.code]){
                newDescs_L5 = newDescs_L5.concat(dbCodeTable[elCode.code])
              }
            })

            newDescs_L5.sort(function(a, b){return b.score - a.score})
            newDescs_L5 = newDescs_L5.slice(0,config.LOGIC_LIMITS["L5"])

            let alterDescCodes_L5 = []
            newDescs_L5.forEach(elDesc => {
              if(dbAlterDescTable[getSameString(elDesc.desc)]){
                alterDescCodes_L5 = alterDescCodes_L5.concat(dbAlterDescTable[getSameString(elDesc.desc)])
              }
                
            })

            alterDescCodes_L5 = alterDescCodes_L5.filter(el => el.brand == pcBrand)
            alterDescCodes_L5.sort(function(a, b){return b.score - a.score})

            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, alterDescCodes_L5, 5,cmpRowData)

            if(psData.length > 0) {
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            // L6
            let db_L6 = dbAlterDescTable[getSameString(pcDesc)] || []
            altStringCodes_L6 = db_L6.filter(el => el.brand != pcBrand)
            altStringCodes_L6.sort(function(a, b){return b.score - a.score})
            altStringCodes_L6 = altStringCodes_L6.slice(0,config.LOGIC_LIMITS["L6"])

            let newDescs_L6 = []
            altStringCodes_L6.forEach(elCode => {
              if(dbCodeTable[elCode.code]){
                newDescs_L6 = newDescs_L6.concat(dbCodeTable[elCode.code])
              }
            })

            newDescs_L6.sort(function(a, b){return b.score - a.score})
            newDescs_L6 = newDescs_L6.slice(0,config.LOGIC_LIMITS["L6"])

            let alterDescCodes_L6 = []
            newDescs_L6.forEach(elDesc => {
              if(dbAlterDescTable[getSameString(elDesc.desc)])
                alterDescCodes_L6 = alterDescCodes_L6.concat(dbAlterDescTable[getSameString(elDesc.desc)])
            })

            alterDescCodes_L6 = alterDescCodes_L6.filter(el => el.brand == pcBrand)
            alterDescCodes_L6.sort(function(a, b){return b.score - a.score})

            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, alterDescCodes_L6, 6,cmpRowData)

            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            // L7
            let altStringCodes_L7 = []

            permuteShift(pcDesc).forEach(permutedDesc => {
              if(dbAlterDescTable[permutedDesc])
                altStringCodes_L7 = altStringCodes_L7.concat(dbAlterDescTable[permutedDesc])
            })

            altStringCodes_L7 = altStringCodes_L7.filter(el => el.brand != pcBrand)
            altStringCodes_L7.sort(function(a, b){return b.score - a.score})
            altStringCodes_L7 = altStringCodes_L7.slice(0,config.LOGIC_LIMITS["L7"])

            let newDescs_L7 = []
            altStringCodes_L7.forEach(elCode => {
              if(dbCodeTable[elCode.code]){
                newDescs_L7 = newDescs_L7.concat(dbCodeTable[elCode.code])
              }
            })

            newDescs_L7.sort(function(a, b){return b.score - a.score})
            newDescs_L7 = newDescs_L7.slice(0,config.LOGIC_LIMITS["L7"])

            let alterDescCodes_L7 = []
            newDescs_L7.forEach(elDesc => {
              if(dbAlterDescTable[getSameString(elDesc.desc)])
                alterDescCodes_L7 = alterDescCodes_L7.concat(dbAlterDescTable[getSameString(elDesc.desc)])
            })

            alterDescCodes_L7 = alterDescCodes_L7.filter(el => el.brand == pcBrand)
            alterDescCodes_L7.sort(function(a, b){return b.score - a.score})

            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, alterDescCodes_L7, 7,cmpRowData)

           if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            // L8
            let descAltPermutationCodes_L8 = []
            permuteShift(getSameString(pcDesc)).forEach(permutedDesc => {
              if(dbAlterDescTable[permutedDesc])
                descAltPermutationCodes_L8 = descAltPermutationCodes_L8.concat(dbAlterDescTable[permutedDesc])
            })
            let all_L8 = descAltPermutationCodes_L8.filter(el => el.brand != pcBrand)
            all_L8.sort(function(a, b){return b.score - a.score})
            psData = []
            psData = checkPartsouq(pcDesc,psFile,ref, vin,pcNumber, pcBrand, all_L8, 8,cmpRowData)
            if(psData.length > 0) {
              
              psData.forEach((psRow, i) => {
                cmpRowData += (pcIndex + " . " + possibleRows) + "," + pcData +","+ psRow + "\n"
                possibleRows++
              })

              notBlank = true
            }

            if(cmpRowData){

              if(config.COMPARE_CHECK){
                let psTempRow = cmpRowData.split(/\r?\n/)
                
                let result = psTempRow.filter(el => {
                  if(el.includes("Check") || el == "") return false;
                  else return true;
                })
                let psData_result = psTempRow.filter(el => {
                  if(el.includes("Check")) return true;
                  else return false;
                })

                let temp = []

                let idx = psData_result.findIndex(el => getSameString(el.split(",")[1]) == getSameString(el.split(",")[4]))
                if(idx < 0) {
                  psData_result.forEach(el => {
                    let elPsDesc = el.split(",")[1]
                    let elPcDesc = el.split(",")[4]
                    let simObj = {}
                    let sim = wordsSimilarity.get(getSameString(elPsDesc),getSameString(elPcDesc))
                    simObj.sim = sim
                    simObj.data = el
                    temp.push(simObj)
                  })

                  temp.sort((a,b) => {
                    return b.sim - a.sim
                  })

                  temp = temp.map(el => el.data).slice(0, parseInt(config.FILTER_LIMIT))
                              
                } else {
                  temp.push(psData_result[idx])
                }

                result = result.concat(temp)

                 result.sort((a,b) => {
                  let a_posRow = a.split(",")[0].split(".")[1]
                  let b_posRow = b.split(",")[0].split(".")[1]

                  return parseInt(a_posRow) - parseInt(b_posRow)
                })

                let resultText = result.join("\n") + "\n"

                cmpData += resultText + "\n"
                cmpFilterData.push(resultText)
              } else {
                cmpData += cmpRowData + "\n"
                cmpFilterData.push(cmpRowData) 
              }
 
            }
                 
          }
          if(!notBlank){
            cmpData += (pcIndex + " . " + 0) +","+ pcData + "\n\n"
            cmpFilterData.push((pcIndex + " . " + 0) +","+ pcData)
          } 
        }
      }
    }
  });

  let cmpFilterResult = "Line,PC Desc,PC Number,PC Code(setting),PS Desc,PS Number,PS Code,PS Code(setting),Qty,Matched,Logic Number, Score, DB Desc, PC duplicate, Filter Status\n"
  let filterRow = []
  let codeObjList = []
  let codeOverFiveObjList = []
  let partNumberList = []

  cmpFilterData.forEach((row,i) =>{
    let codeObj = {}
    let codeOverFiveObj = {}
    let rowSplit = row.split(/\r?\n/)
    
    let subList = []
    rowSplit.forEach(subRow => {
      let codeSetting = subRow.split(",")[7] || ""
      let logicNumber = subRow.split(",")[10] || ""
      let score = subRow.split(",")[11] || ""
      let check = subRow.split(",")[13] || ""
      if(codeSetting != "" && logicNumber != "" && score != "" ) {
        if(parseInt(logicNumber) < 5){
          if(!codeObj[codeSetting]){
            codeObj[codeSetting] = getScore(score,logicNumber)
          } else {
            if(check != "Check")
            codeObj[codeSetting] += getScore(score,logicNumber)
          }
        } else {
          if(!codeOverFiveObj[codeSetting]){
            codeOverFiveObj[codeSetting] = getScore(score,logicNumber)
          } else {
            if(check != "Check")
              codeOverFiveObj[codeSetting] += getScore(score,logicNumber)
          }
        }
      }
    })

    rowSplit.forEach(subRow => {
      let partNumber = subRow.split(",")[5] || ""
      let codeSetting = subRow.split(",")[7] || ""
      let qty = subRow.split(",")[8] || ""
      let logicNumber = subRow.split(",")[10] || ""
      let score = subRow.split(",")[11] || ""
      let check = subRow.split(",")[13] || ""
      let subObj = {}

      if(codeSetting != "" && logicNumber != "" && score != "" ) {
        if(parseInt(logicNumber)>4) subObj["over"] = 1
        else subObj["over"] = 0
        subObj["number"] = partNumber
        subObj["totalScore"] = codeObj[codeSetting] !== undefined ? codeObj[codeSetting] : codeOverFiveObj[codeSetting]
        subObj["score"] = score
        subObj["qty"] = qty
        subObj["code"] = codeSetting
        let idx = subList.findIndex(el => el.number == partNumber)
        if(idx <0){
          subList.push(subObj)
        }
        
      }

    })

    subList.sort((a,b) => {
      if(a.over == b.over) {
        if(a.totalScore == b.totalScore) return parseInt(b.score) - parseInt(a.score)
        else return b.totalScore - a.totalScore
      } else return a.over - b.over
      
    })

    partNumberList.push(subList)
  })

  let topNumList = []
  let tempNumList = []
  partNumberList.forEach((el,i)=>{
    let topNum = el[0] || {}
    topNumList.push(topNum)
    tempNumList.push(topNum)

  })

  let duplicateList = []
  topNumList.forEach((el,i)=> {
    let indexes = getDupList(topNumList, el)
    duplicateList.push(indexes)
  })

  let resultList = []
  if(!allowDuplicate){
    topNumList.forEach((el,i)=> {
      if(JSON.stringify(el) !== "{}"){
        let possibleDuplicates = parseInt(el.qty)
        if(duplicateList[i].length > 0) {
          if(duplicateList[i].length > possibleDuplicates -1){
            for(let j = duplicateList[i].length - 1 ; j >=possibleDuplicates-1 ; j-- ) {
              if(i < duplicateList[i][j]) {
                tempNumList[duplicateList[i][j]] = {}
              } 
            }
            duplicateList[i] = duplicateList[i].slice(0,possibleDuplicates-1)
          }
        }       
      }
    })

    tempNumList.forEach(el => resultList.push(el))

    tempNumList.forEach((el,i) => {
      if(JSON.stringify(el) === "{}") {
        if(partNumberList[i].length > 0) {
          partNumberList[i].shift()

          while(partNumberList[i].length > 0){
            let obj = partNumberList[i].shift()
            let rows =getDupList(resultList,obj)
            if((rows.length < parseInt(obj.qty) && rows.length > 0) || rows.length == 0) {
              resultList[i] = obj
              break;
            }
          }
        } 
      } 
    })
  } else resultList = topNumList

    let duplicateList_ibc = []
    resultList.forEach((el,i)=> {
      let indexes = getDupList(resultList, el)
      duplicateList_ibc.push(indexes)
    })
  cmpFilterData.forEach((row,i) =>{
    let rowSplit = row.split(/\r?\n/)
    if(rowSplit.length > 1){
      if(JSON.stringify(resultList[i]) !== '{}') {
        let resultRows = rowSplit.filter(el => {
          if(el.includes("Check")) {
            let code = el.split(",")[7]
            if( code == resultList[i].code){
              return true;
            } else return false;
          } else {
            let number = el.split(",")[5]
            if( number == resultList[i].number) return true;
            else return false;
          }

        })
        resultRows.sort((a,b) => {
          let a_logicNumber = a.split(",")[10] || ""
          let a_score = a.split(",")[11] || ""
          let b_logicNumber = b.split(",")[10] || ""
          let b_score = b.split(",")[11] || ""

          return getScore(b_score,b_logicNumber) - getScore(a_score,a_logicNumber)
        })
        // console.log(resultRows)
        let max_logicNumber = resultRows[0].split(",")[10] || ""
        let max_score = resultRows[0].split(",")[11] || ""
        let max_partNumber = resultRows[0].split(",")[5] || ""
        let maxScore = getScore(max_score, max_logicNumber)

        let sameScoreRows = resultRows.filter((el,i) => {

          let logicNumber = el.split(",")[10] || ""
          let score = el.split(",")[11] || ""
          let partNumber = el.split(",")[5] || ""
          let curScore = getScore(score,logicNumber)
          if(i == 0) return true
          else return (maxScore == curScore && max_partNumber != partNumber);

        })
        sameScoreRows = sameScoreRows.map(el => {
          if(sameScoreRows.length > 1) {
             let splits = el.split(",")
            if(splits.length >= 14)
              splits[13] = 'multiple matches, Filtered Row'
            else splits.push('multiple matches, Filtered Row')
            return splits.join(",")
        } else return el + (el.includes("Check")? ", Filtered Row":",,Filtered Row")
         
        })

        if(config.COMPARE_FILTER_CHECK && sameScoreRows.length > 1){
          let temp = []
          console.log(sameScoreRows)
          let idx = sameScoreRows.findIndex(el => getSameString(el.split(",")[1]) == getSameString(el.split(",")[4]))
          if(idx < 0) {
            sameScoreRows.forEach(el => {
              let elPsDesc = el.split(",")[1]
              let elPcDesc = el.split(",")[4]
              let simObj = {}
              let sim = wordsSimilarity.get(getSameString(elPsDesc),getSameString(elPcDesc))
              simObj.sim = sim
              simObj.data = el
              temp.push(simObj)
            })

            temp.sort((a,b) => {
              return b.sim - a.sim
            })

            temp = temp.map(el => el.data).slice(0, parseInt(config.FILTER_LIMIT))
                        
          } else {
            temp.push(psData_result[idx])
          }

          temp.forEach(el => filterRow.push(el))

        } else sameScoreRows.forEach(el => {

          filterRow.push(el)
        })
      } else filterRow.push(rowSplit[0] != "" ? (rowSplit[0] + (rowSplit[0].includes("Check")? "," :",,") + "No match Found") : rowSplit[0])
      
    } else filterRow.push(rowSplit[0] + ",,,,,,,,,,,No match Found") 
  })
  let newMarkCmpRow = []
  newMarkCmpRow = cmpData.split(/\r?\n/).map(row => {
    let lineNumber = row.split(",")[0] 
    let idx =filterRow.findIndex(fRow => fRow.split(",")[0] == lineNumber)
    if(idx >=0 ) return filterRow[idx]
    else return row 
  })
  cmpData = newMarkCmpRow.join("\n")

  cmpFilterResult += filterRow.join("\n")        
  
  let ibcText = ""
  filterRow.forEach((resultRow,i) => {
    if(!resultRow.includes("PS Number")) {
      let psNumber = resultRow.split(",")[5] || "NS"

      
      let duplicates = ""
      if(duplicateList_ibc[i]){
        duplicates =  duplicateList_ibc[i].length > 0 ? "Duplicate with row - " : ""
        duplicateList_ibc[i].forEach(el => {
          duplicates += (el+1) + " "
        })
      }
      
      let comment = resultRow.split(",")[5] ? (resultRow.includes("multiple matches") ? ("multiple matches - "+resultRow.split(",")[4]) : duplicates): resultRow.split(",")[1]+" - match not found"
      ibcText += (psNumber +",,,,"+ comment + "\n")
    }
  })

  let ibcDir = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + "IBC"
  let d = new Date()
  var datestring = new Date().toISOString().slice(0,19).replace(/:/g,"-")
  let ibcFilePath = ibcDir +"\\" +ref +"_"+ vin +"_"+ datestring +".csv"

  // create new directory
  try {
    if(isHandType){
        fs.writeFileSync(handTypeCmpFilePath  ,cmpData);
        console.log(handTypeCmpFilePath + " is saved!");
        fs.writeFileSync(handTypeCmpFilterFilePath, cmpFilterResult);
        console.log(handTypeCmpFilterFilePath + " is saved!");

    } else {
      fs.writeFileSync(cmpFilePath, cmpData);
      console.log(cmpFilePath + " is saved!");
      logHandler(LOG_COMPARE, ref, vin , customerName, dueDate )


      fs.writeFileSync(cmpFilterFilePath, cmpFilterResult);
      console.log(cmpFilterFilePath + " is saved!");
      logHandler(LOG_COMPARE_FILTER, ref, vin , customerName, dueDate)

      // first check if directory already exists
      if (!fs.existsSync(ibcDir)) {
          fs.mkdirSync(ibcDir);
      } 
      fs.writeFileSync(ibcFilePath, ibcText);
      console.log(ibcFilePath + " is saved!");
      logHandler(LOG_IBC, ref, vin , customerName, dueDate)      
    }
      

  } catch (err) {
    console.log(err.message)
    io.emit('err',{err:"File Saving Error\n"+err.message})
  }

  let end = new Date().getTime()
  console.log(getExecTime(end-start))      
}



function queHandler(queActionType, ref = "53972", vin = "JTNKU3JEX0J093205", customerName = "", dueDate = "", pcScrapeData = ""){
  let dir = path.join(__dirname, config.TEMP_DIR_NAME)
  // let dir = __dirname + "\\" +config.TEMP_DIR_NAME
  let queFilePath = path.join(dir, config.QUE_FILE_NAME +".que")
  // let queFilePath = dir +"\\" +config.QUE_FILE_NAME +".txt"

  // create new directory
  try {
    // first check if directory already exists
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    let que = []
    if(fs.existsSync(queFilePath)){
      let queFileData = fs.readFileSync(queFilePath)
      que = JSON.parse(queFileData);
    }
    let duplicateIdx = que.findIndex(el => el.ref == ref && el.vin == vin)

    if(queActionType == QUE_ADD){
      if(duplicateIdx >= 0) {
        io.emit('err',{err:"QUE:" + ref+" already exists"})
        return console.log("QUE:" + ref+" already exists");
      }
      let newRef = {}

      newRef.ref = ref
      newRef.vin = vin
      newRef.csName = customerName
      newRef.dueDate = dueDate
      newRef.pcScrapeData = pcScrapeData
      que.push(newRef) 

      fs.writeFileSync(queFilePath, JSON.stringify(que));
      console.log(queFilePath + " is saved!");

      logHandler(LOG_ADD_QUE, ref, vin, customerName, dueDate)

    } else if (queActionType == QUE_REMOVE){
      if(duplicateIdx >= 0) que.splice(duplicateIdx, 1)
        fs.writeFileSync(queFilePath, JSON.stringify(que));
        console.log(queFilePath + " is saved!");

        logHandler(LOG_REMOVE, ref, vin, customerName, dueDate)
        return que
    } else if (queActionType == QUE_ALL){
      return que
    }

  } catch(err) {
    throw err
  }
}

function logHandler(logType = 0, ref = "53972", vin = "JTNKU3JEX0J093205", customerName = "", dueDate = "" ){
  let dir = path.join(__dirname, config.TEMP_DIR_NAME)
  // let dir = __dirname + "\\" +config.TEMP_DIR_NAME

  let logFilePath = path.join(dir, config.LOG_FILE_NAME +".log")
  // create new directory
  try {
    // first check if directory already exists
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    let log_sub = []
    if(fs.existsSync(logFilePath)){
      let logFileData = fs.readFileSync(logFilePath)
      log_sub = JSON.parse(logFileData);
    }
    if(logType == LOG_ALL) {
      return log_sub
    }

    let duplicateIdx = log_sub.findIndex(el => el.ref == ref && el.vin == vin)
    if(logType == LOG_REMOVE){
       if(duplicateIdx >= 0) log_sub.splice(duplicateIdx,1)
    } else {

      if(duplicateIdx >= 0){
        duplicate = log_sub[duplicateIdx]
        switch(logType){
          case LOG_PC: duplicate.pc = 1; break;
          case LOG_PS: duplicate.ps = 1; break;
          case LOG_COMPARE: duplicate.compare = 1; break;
          case LOG_COMPARE_FILTER : duplicate.compare_filter = 1; break;
          case LOG_IBC: duplicate.ibc = 1;break;
          case LOG_START_FROM_QUE: duplicate.status = 1; break;
          case LOG_FINISH_FROM_QUE: duplicate.status = 2; break;
        }
     } else {
       let newLog = {}
        newLog.ref = ref
        newLog.vin = vin
        newLog.csName = customerName
        newLog.dueDate = dueDate
        newLog.pc = 0
        newLog.ps = 0
        newLog.compare = 0
        newLog.compare_filter = 0
        newLog.ibc = 0
        newLog.status = 0
        switch(logType){
          case LOG_PC: newLog.pc = 1; break;
          case LOG_PS: newLog.ps = 1; break;
          case LOG_COMPARE: newLog.compare = 1; break;
          case LOG_COMPARE_FILTER : newLog.compare_filter = 1; break;
          case LOG_IBC: newLog.ibc = 1;break;
          case LOG_START_FROM_QUE: newLog.status = 1; break;
          case LOG_FINISH_FROM_QUE: newLog.status = 2; break;
        }
        log_sub.push(newLog)
     }
    }

    log = log_sub
    
    io.emit("log_handle",{log:log_sub, total:log_sub.length})

    fs.writeFileSync(logFilePath, JSON.stringify(log_sub));
    console.log("logged");

  } catch(err) {

     console.error(err);
  }
}

function savePCData(ref = "53972", vin = "JTNKU3JEX0J093205",customerName = "", dueDate ="", pcScrapeData = "", isHandType = false){
  let dir = path.join(__dirname, config.RESULT_DIR_NAME, ref +"_"+ vin)
  // let dir = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ vin
  let handTypeDir = path.join(__dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME)
  // let handTypeDir = __dirname+"\\" +config.RESULT_DIR_NAME + "\\handtype"


  let pcFilePath = path.join(dir, config.PC_FILE_NAME +".csv")
  // let pcFilePath = dir +"\\" +config.PC_FILE_NAME +".csv"
  let pcHandPath = path.join(handTypeDir, config.HANDTYPE_LIST_FILE_NAME + ".csv")
  // let pcHandPath = handTypeDir +"\\" +"list.csv"
  // create new directory
  try {
    // first check if directory already exists
    if(isHandType) {
      if (!fs.existsSync(handTypeDir)) fs.mkdirSync(handTypeDir);

      fs.writeFileSync(pcHandPath, pcScrapeData);
      console.log(pcHandPath + " is saved!");
    } else {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);

      fs.writeFileSync(pcFilePath, pcScrapeData);
      console.log(pcFilePath + " is saved!");
      logHandler(LOG_PC, ref, vin , customerName, dueDate)
    }
    
  } catch(err) {
    throw err
  }
}

async function scrapePS(ref = "53972", vin = "JTNKU3JEX0J093205", customerName = "", dueDate = "", isPure = false, isHandType = false){
  let isURL = false
  if(vin.includes("https")) isURL = true
  let dir = path.join(__dirname, config.RESULT_DIR_NAME, ref +"_"+ (isURL? "":vin))
  // let dir = __dirname + "\\" +config.RESULT_DIR_NAME + "\\" + ref +"_"+ (isURL? "":vin)
  let psFilePath = path.join(dir, config.PS_FILE_NAME+".csv")
  // let psFilePath = dir + "\\"+config.PS_FILE_NAME+".csv"

  let pureDir = path.join(__dirname, config.RESULT_DIR_NAME)
  // let pureDir = __dirname + "\\" + config.RESULT_DIR_NAME
  let purePSFilePath = path.join(pureDir, (isURL? URL_SCRAPE_FILE_NAME :(vin + "_" + config.VIN_SCRAPE_FILE_SUFFIX))+".csv") 
  // let purePSFilePath = pureDir + "\\" + (isURL?"ps_url_scrape.csv":(vin + "_fullDB.csv")) 

  let handTypeDir = path.join(__dirname, config.RESULT_DIR_NAME, config.HANDTYPE_DIR_NAME)
  // let handTypeDir = __dirname + "\\" + config.RESULT_DIR_NAME + "\\handtype"
  let handTypeFilePath = path.join(handTypeDir, config.PS_FILE_NAME + ".csv")
  // let handTypeFilePath = pureDir + "\\" + config.PS_FILE_NAME + ".csv"

  const browser = await puppeteer.launch({ headless: true });

  const defaultPage =  await browser.newPage()
  defaultPage.setDefaultNavigationTimeout(0);

  let defaultURL = isURL ? vin : `${config.PS_URL}/en/search/all?q=${vin}`

  await defaultPage.goto(defaultURL)
  await defaultPage.waitForSelector('.simple-container');

  let categories = await defaultPage.$$eval(".vehicle-tg > tbody > tr > td", options => {
    return options.map(option => {
      let newObj = {}

      let aTag = option.querySelector("a")
      if(aTag) newObj.href = aTag.href
      else newObj.href = ""

      newObj.text = option.innerText || ""
      return newObj
    });
  });

  categories = categories.map(el => {
    if(el.href) return el
    else {
      el.href = defaultURL
      return el
    }
  })

  let brand = await defaultPage.$eval(".breadcrumb > li:nth-child(3)",c => c.innerText)


  // ps scrapping
  let psScrapeData = "Category,SubCategory,Number,Name,Code,Qty\n";
  let categoryId = 0

  const crawlCategory = async (catId, catText, catURL) => {
    let categoryData = ""

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);

    await page.goto(catURL);
    await page.waitForSelector('.simple-container');

    let scrapeTarget = config.SCRAPE_TARGET[brand.trim()]

    let isIgnoreList = config.SCRAPE_CONFIG[brand.trim()] || 1
    
    let subCategories = await page.$$(".thumb-boss")
    for(let i = 0; i < subCategories.length; i++){
      try {
        let canIgnore = false

        let subCatText = await subCategories[i].evaluate(s => s.innerText)

        let isTargetExist = scrapeTarget ? (scrapeTarget[(catText+isIgnoreList?"_X":"")] ? scrapeTarget[(catText+isIgnoreList?"_X":"")].find(sc => sc == subCatText.split(":")[0]): null) : null     

        if((!isTargetExist && scrapeTarget && !isIgnoreList) || (isIgnoreList && isTargetExist)) canIgnore = true
          console.log(catText)
        console.log("Category: " + catId +"====>"+ (catText+isIgnoreList?"_X":"") +" SubCategory: " + i + "====> "+subCatText + " Ignore===>"+ canIgnore)

        if(!canIgnore)
        {
            let subCatData = ""

            let aTags = await subCategories[i].$$("a")

            await aTags[2].click();
            await page.waitForNavigation()

            const tbHeader = await page.evaluate(() => {
    
              let ths = Array.from(document.querySelectorAll('.pop-vin > thead > tr'))
              return ths.map(th => th.innerText.replace(/,/g," ").replace(/\t/g,","))
            });
            
            let qtyIndex = tbHeader ? (tbHeader[0] ? tbHeader[0].split(",").indexOf("Qty Required") : 0):0

            const tbBody = await page.evaluate(() => {
    
              let trs = Array.from(document.querySelectorAll('.pop-vin > tbody > tr'))
              return trs.map(tr => tr.innerText.replace(/,/g," ").replace(/\t/g,","))
            });

            // save to result
            tbBody.forEach(row =>{

              let qty = qtyIndex > 0 ? ( row.split(",") ? row.split(",")[qtyIndex] : "") : ""
              subCatData += catText
                        +"," + subCatText
                        +"," +row.split(",")[0]
                        +"," +row.split(",")[1]
                        +"," +row.split(",")[2]
                        +"," +qty +"\n"
            })

            categoryData += subCatData
        }

        await page.goto(catURL);
        try {
          await page.waitForSelector('.thumb-boss');
        } catch(err) {
          console.log("####### Let us bypass Cloudflare #######")
          await page.goto('https://google.com')
          await page.waitForTimeout(10000)
          await page.goto(catURL);
          await page.waitForSelector('.thumb-boss');
          console.log("####### Cloudflare bypassed #######")
        }
        await page.waitForTimeout(3000)

        subCategories = await page.$$(".thumb-boss")
        console.log(catText + "'s length " + subCategories.length)
      } catch (err){
          console.log(err)
          io.emit('err',{err:"PS Scrapping Error\n"+err.message})

          await page.goto(catURL);
          await page.waitForSelector('.thumb-boss');

          subCategories = await page.$$(".thumb-boss")
          console.log(catText + "'s length " + subCategories.length)
      }
    }   

    psScrapeData += categoryData
    console.log(catId + " closed.")
    await page.close()
  };

  const promiseProducer = () => {
    if(categoryId < categories.length) {
      categoryId++
      return crawlCategory(categoryId-1, categories[categoryId-1].text, categories[categoryId-1].href);
    } else return null;
  };

  const pool = new PromisePool(promiseProducer, config.MAX_CATEGORY);
  await pool.start();


  console.log("Browser closed!")
  await browser.close();
  try {
    if(isHandType){
      if (!fs.existsSync(handTypeDir)) {
          fs.mkdirSync(handTypeDir);
      } 
      console.log(handTypeFilePath + " is saved!");
      fs.writeFileSync(handTypeFilePath, psScrapeData)
    } else {
      if(!isPure){
        fs.writeFileSync(psFilePath, psScrapeData)
        console.log(psFilePath + " is saved!");
        logHandler(LOG_PS, ref, vin, customerName, dueDate)
      } else {
        console.log(purePSFilePath + " is saved!");
        fs.writeFileSync(purePSFilePath, psScrapeData)
      }
    }
  } catch(err){
    throw err
  }

}

function scrapeQue(cmpType = 1, allowDuplicate = true){
  let dir = path.join(__dirname, config.TEMP_DIR_NAME)
  // let dir = __dirname + "\\" +config.TEMP_DIR_NAME
  let queFilePath = path.join(dir, config.QUE_FILE_NAME +".que")
  // let queFilePath = dir +"\\" +config.QUE_FILE_NAME +".txt"

  let que = []
  if(fs.existsSync(queFilePath)){
    let queFileData = fs.readFileSync(queFilePath)
    que = JSON.parse(queFileData);
  }

  que.forEach(async (el) => {
    try {
      logHandler(LOG_START_FROM_QUE, el.ref, el.vin, el.csName, el.dueDate)
      savePCData(el.ref, el.vin, el.csName, el.dueDate, el.pcScrapeData);
      await scrapePS(el.ref, el.vin, el.csName, el.dueDate);
      compare(el.ref, el.vin, el.csName, el.dueDate, cmpType, allowDuplicate);
      logHandler(LOG_FINISH_FROM_QUE, el.ref, el.vin, el.csName, el.dueDate)      
    } catch(err) {
      console.log(err)
      io.emit('err',{err:"QUE scrapping error\n"+err.message})
    }
  })

}
function dbIndexing(){
  console.log('DB indexing...')
  const codeIndexPath = path.join(__dirname, config.DATABASE_DIR_NAME, config.DB_CODE_INDEX_FILE_NAME +".json")
  const alterDescPath = path.join(__dirname, config.DATABASE_DIR_NAME, config.DB_ALTER_DESC_FILE_NAME + ".json")
  const descPath = path.join(__dirname, config.DATABASE_DIR_NAME, config.DB_DESC_FILE_NAME + ".json")
  const processDbPath = path.join(__dirname,config.DATABASE_DIR_NAME, config.PROCESS_DB_NAME + '.csv')
  //  const codeIndexPath = __dirname + "\\database\\db_code.json"
  // const alterDescPath = __dirname + "\\database\\db_alter_desc.json"
  // const descPath = __dirname + "\\database\\db_desc.json"
  const file = readline.createInterface({
    input: fs.createReadStream(processDbPath)
    // input: fs.createReadStream(__dirname + "\\database\\" + config.PROCESS_DB_NAME + '.csv')
  })

  const rows = []
  let codeIndexObj = {}
  let alterDescObj = {}
  let descObj = {}

  let lineCount = 0
  file.on('line', line => {
      let [brand, supplier, partNumber, desc, partCode, score] = line.split(",")
      
      if(!codeIndexObj[partCode]){
        codeIndexObj[partCode] = []
      }
      let sameDesc = getSameString(desc)
      if(!alterDescObj[sameDesc]){
        alterDescObj[sameDesc] = []
      }

      let cleanDesc = getCleanString(desc)
      if(!descObj[cleanDesc]){
        descObj[cleanDesc] = []
      }
      let subObj = {}
      subObj.brand = brand
      subObj.desc = desc
      subObj.score = score
      subObj.code = partCode
      
      codeIndexObj[partCode].push(subObj)
      alterDescObj[sameDesc].push(subObj)
      descObj[cleanDesc].push(subObj)

  })

  file.on('close', () => {
    // console.log(obj)
    let codIndex = JSON.stringify(codeIndexObj)
    let alterDesc = JSON.stringify(alterDescObj)
    let desc = JSON.stringify(descObj)
    try {
      fs.writeFileSync(codeIndexPath, codIndex)
      fs.writeFileSync(alterDescPath, alterDesc)
      fs.writeFileSync(descPath, desc)
      console.log('READY')
    } catch (err) {
      console.log(err)
      io.emit('err',{err:"File Saving Error\n"+err.message})
    }
  })

}

function getCleanString(str){
  if (typeof str === 'string') {

    str = config.IGNORE_SPECIAL_CHARACTERS ? str.replace(/([^a-zA-z0-9 || \s || \/]+)/g, s0 => ' ').toLowerCase() : str
    str = str.replace(/\s\s+/g, ' ')
    str = str.trim()

    let splits = str.split(" ")
    config.IGNORE_STRINGS.forEach(ignStr => {
      splits.remove(ignStr.toLowerCase())
    })
    str = splits.join(" ")
    return str
  }
  else return ""
}

function checkPartsouq(pcDesc,psFile,ref,vin,pcNumber, pcBrand, codeList, logicNumber, rowData){
  if(codeList.length > 0){
    let result = []
    let i = 0;
    let possibleCodes = 0

    while(possibleCodes < parseInt(config.LOGIC_LIMITS[("L"+logicNumber)])){

      if(codeList.length == i) break;

      let code = codeList[i].code

      let psData = []

      psFile.split(/\r?\n/).forEach(line =>  {
        let line_splits = line.split(",")
        let psNumber = line_splits[2] || ""
        let psDesc = line_splits[3] || ""
        let psCode = line_splits[4] || ""
        let psQty = line_splits[5] || ""
        let psCodeSetting = getCode(pcBrand, psNumber) || ""

        if(psCodeSetting == code && code != "" && psDesc != ""){
        
          let psRow = psDesc + ","
              + psNumber + ","
              + psCode + ","
              + psCodeSetting + ","
              + psQty + ","
              + (psNumber == pcNumber) + ","
              + logicNumber + ","
              + codeList[i].score+","
              + codeList[i].desc
          let duplicateCmp = false

          rowData.split(/\r?\n/).forEach(row => {
            let rowDesc = row.split(",")[4] || ""
            let rowNum = row.split(",")[5] || ""
            let rowCode = row.split(",")[6] || ""
            let rowCodeSetting = row.split(",")[7] || ""
            let rowQty = row.split(",")[8] || ""
            let rowScore = row.split(",")[11] || ""
            let dbDesc = row.split(",")[12] || ""

            if(dbDesc == codeList[i].desc) duplicateCmp = true
          })

          let duplicatePS = false
          psData.forEach(el => {
            let elPsNumber = el.split(",")[1] || ""
            let elDesc = el.split(",")[0] || ""
            let elDbDesc = el.split(",")[8] || ""
            if(elDesc == psDesc) duplicatePS = true
          })

          let duplicateResult = false
          result.forEach(el => {
            let elPsNumber = el.split(",")[1] || ""
            let elDesc = el.split(",")[0] || ""
            if(elPsNumber == psNumber && elDesc == psDesc) duplicateResult = true
          })


          if(duplicateCmp == false && duplicatePS == false && duplicateResult == false)
              psData.push(psRow)
        }
      })
      
      if(psData.length > 0) {
        psData = psData.length > 1 ? psData.map(el => el+",Check") : psData

          result = result.concat(psData)

        possibleCodes++
      }
      
      i++
    }
    return result    
  } else return []
}

function getCode(brand,partNumber) {
  if(partNumber){
    let partcode = ""
      if(partNumber.includes(" ")){
        partNumber = partNumber.split(" ")[0]
      }
      let detail = config.PARTCODES[brand]
      if(detail){
        if(brand == "Mazda"){

          let positions
          if(isNaN(partNumber[partNumber.length-1])){
            positions = detail.pos1
          } else positions = detail.pos

          positions.forEach(p => {
            let pos
            switch(detail.type){
              case "left":  pos = p-1; partcode += partNumber[pos] ? partNumber[pos]:""; break;
              case "right": pos = partNumber.length - p; partcode += partNumber[pos] ? partNumber[pos]:""; break;
            }
          })
        } else {
          detail.pos.forEach(p => {
            let pos
            switch(detail.type){
              case "left":  pos = p-1; partcode += partNumber[pos] ? partNumber[pos]:""; break;
              case "right": pos = partNumber.length - p; partcode += partNumber[pos] ? partNumber[pos]:""; break;
              case "prefix": let prefixInstance = partNumber.split(detail.affix)[detai.affixPos];
                              partcode += pos > 1?prefixInstance[pos-1]:detail.affix; break;
            }
          })
        }
      }
      return partcode    
    } else return ""
}

function processDb(){
  const dbPath = path.join(__dirname, config.DATABASE_DIR_NAME, config.DB_NAME + ".csv")
  const processDbPath = path.join(__dirname, config.DATABASE_DIR_NAME, config.PROCESS_DB_NAME + ".csv")
  const file = readline.createInterface({
    input: fs.createReadStream(dbPath)
    // input: fs.createReadStream(__dirname + "\\database\\" + config.DB_NAME + '.csv')
  })

  const rows = []
  let obj = {}

  let lineCount = 0
  file.on('line', line => {
      rows.push(line)
  })

  file.on('close', () => {
    console.log(rows.length)
    let result = "Brand,Supplier Quote Nr,OEM Part Nr,Description,Part Code (setting), Score\n"
    let resultRow = []
    let total = rows.length
    rows.forEach((currentRow, i) =>{
      try {
        console.log("Processing DB: "+(i/total).toFixed(3) + "%")
        // remove commas
        var countComma = (currentRow.match(/,/g) || []).length;
        if(countComma > 3){
          for(let c =0; c< countComma-3; c++){
            let idx = currentRow.lastIndexOf(",")

            if(idx >= 0){
              currentRow = currentRow.slice(0, idx)+" "+ currentRow.slice(idx+1);
            }
          }
        }
        let currentRowSplit = currentRow.split(",")
        let brand = currentRowSplit[0] || ""
        let partNum = currentRowSplit[2] || ""
        let desc = currentRowSplit[3] || ""
        let partCode = getCode(brand,partNum) || ""

        let duplicate = resultRow.findIndex(compareRow => {
          let compareRowSplits = compareRow.split(",")
          let compareBrand = compareRowSplits[0] || ""
          let compareNum = compareRowSplits[2] || ""
          let compareDesc = compareRowSplits[3] || ""
          let compareCode = getCode(compareBrand,compareNum) || ""
          return (partCode == compareCode && getSameString(compareDesc) == getSameString(desc) && compareBrand == brand)
        })

        if(duplicate >=0) {
          let lastIndex = resultRow[duplicate].lastIndexOf(",")
          resultRow[duplicate] = resultRow[duplicate].substring(0,lastIndex)+","+(parseInt(resultRow[duplicate].substring(lastIndex+1))+1)

        } else {
          if(partCode){
            newRow = currentRow + "," + partCode +","+ 1

            resultRow.push(newRow)
          }     
        }
      } catch(err){
        io.emit('err',{err:"Processing DB Error\n"+err.message})
        console.log(err)
      } 
    })
    result += resultRow.join("\n")

    try {
      fs.writeFileSync(processDbPath, result)
      // fs.writeFileSync(__dirname+"\\database\\"+ config.PROCESS_DB_NAME +".csv", result)
      dbIndexing()
      console.log("Processed Database is saved!");      
    } catch(err){
      io.emit('err',{err:"File Saving Error\n" + err.message})
      console.log(err)
    }
  })
}

function getExecTime(time){ 
  return (time/1000).toFixed(2) + "s"
}

function getSameString(str){
  if(str){
    let result = []
    str = getCleanString(str)

    Object.keys(config.SAME_STRINGS).forEach(pKey => {
      config.SAME_STRINGS[pKey].forEach(sameStrings => {
        if(sameStrings.split(" ").length > 1){
          str = str.replace(sameStrings.toLowerCase(),pKey)
        }
      })
    })

    str.split(" ").forEach(subStr => {
      let idx =Object.keys(config.SAME_STRINGS).findIndex(pKey => config.SAME_STRINGS[pKey].indexOf(subStr.toUpperCase()) >= 0)
      if(idx >=0) {
        result.push(Object.keys(config.SAME_STRINGS)[idx].toLowerCase())
      }
      else result.push(subStr.toLowerCase())
    })


    return result.join(" ")
  } else return ""
}

async function scrapeInvoiceUrls(urls, cookies){
  let dbScrapeData = ""

  if(urls && urls.length > 0) {
    dbScrapeData = "Brand,Supplier Quote Nr,OEM Part Nr,Description\n"
    const browser = await puppeteer.launch({ headless: true });
  
    for(let i = 0; i < urls.length; i++){
      try {
        // show the percentage of progress
        console.log("URL scrapping.. "+ (i*100/urls.length).toFixed(1) + "%")

        const page = await browser.newPage();
        await page.setCookie(...cookies)
        page.setDefaultNavigationTimeout(0); 

        await page.goto(urls[i]);
        await page.waitForSelector("body");

        let ref = await page.$eval('body > table:nth-child(2) > tbody > tr > td > table[style="font-family:verdana;font-size:11px"] > tbody:first-child > tr:first-child > td > table > tbody > tr > td:first-child > table > tbody > tr:nth-child(2) > td:nth-child(2)', el => el.innerText)
        let brand = await page.$eval('body > table:nth-child(2) > tbody > tr > td > table[style="font-family:verdana;font-size:11px"] > tbody > tr:first-child > td > table > tbody > tr > td:first-child > table > tbody > tr:nth-child(4) > td:nth-child(2)', el => el.innerText.includes(",") ? el.innerText.split(",")[0] : el.innerText)

        let tds = await page.$$eval('td[title^="OEM"]', list =>{
          return list.map(n => n.getAttribute('title').split('OEM Part Nr:')[1].trim() +"," + (n.innerText.includes("\n") ? n.innerText.split("\n")[0] : n.innerText))
        })

        let dbRowData = ""
        tds.forEach(td => {
            let tdSplits = td.split(',')
            let dbPartNumber = tdSplits.shift() || ""

            let dbDesc = tdSplits.join(" ")     

            dbRowData += brand + "," + ref + "," + dbPartNumber +","+ dbDesc + "\n"
        })

        dbScrapeData += dbRowData

        await page.close()
      } catch (err){
        io.emit('err',{err:"Scrapping InvoiceURL Error\n"+err.message})
        console.log(err)
      }
    }
    console.log("Browser closed")
    await browser.close();
  }
  
  return dbScrapeData
}
const permuteShift = (str) => {
  let permutedDescs = permute(str)
  if(permutedDescs.length > 0)
    permutedDescs.shift()
  return permutedDescs
}
const permute = (str = '') => {
  let splits = str.toLowerCase().split(" ")
   if (!!splits.length && splits.length < 2 ){
      return splits
   }
   const arr = [];
   for (let i = 0; i < splits.length; i++){
      let subString = splits[i]
      if (splits.indexOf(subString) != i)
         continue

       let remainder = splits.slice(0, i).concat(splits.slice(i + 1, splits.length)).join(" ")
       for (let permutation of permute(remainder)){
          arr.push(subString +" "+ permutation)
       }
   }
   return arr
}

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

function getScore(score, logicNumber){
  let result = parseInt(score) / parseInt(config.SCORE_DIVISION[("L"+logicNumber)])
  return result
}

function getDupList(arr, val) {
   let indexes = []
   for(let index =0; index < arr.length; index++){

    if(arr[index]["number"] == val.number && arr[index] != val){
      indexes.push(index)
     }
   }

   indexes.sort((a,b)=> {
    return b.totalScore - a.totalScore
   })
   return indexes;
}

app.listen(config.PORT,()=>{
    console.log(`Scrapping App is running on : ${config.PORT}`)
});

// dbIndexing()
// makeCodeIndexTable()
// makeDescTable()
// makeAlterDescTable()
// compare()
// console.log("Ready")

// console.log(getSimpleString("Front B/Bar Cover Upper"))
// console.log(permute(getSameString("RADIATOR FLUID - COOLANT   !6   5LT")))
// console.log("'"+getSameString("Grille Mould-O/S")+"'")
// console.log("'"+getCleanString("F BAR SLIDE -O/S")+"'")
// permute(getSameString("Front B/Bar Cover Upper")).forEach(permutedDesc => {
//   console.log("============================")
// console.log(dbAlterDescTable[permutedDesc])
// })
// dbAlterDescTable[getSameString("Front B/Bar Cover Upper")]
// console.log(dbAlterDescTable[getSameString("F BAR SLIDE -O/S")].filter(el => el.brand == "Toyota").sort((a,b)=> b.score-a.score))
// console.log(getSimpleString("Front B/Bar Cover Upper"))
// console.log(permuteShift("Front B/Bar Cover"))

// console.log(getCode("Toyota","7593928020"))