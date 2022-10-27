let log = []
let windowCnt = 0
let queWindow
let logWindow
let descWindow
let handtypeWindow
let perPage_que = 10
let page_que = 1
let perPage_log = 50
let page_log = 1
let descCmpType = 1
let descAllowDuplicate = false
let descActionType = 0
let handCmpType = 1
let handAllowDuplicate = false
let handActionType = 0

let toast = document.createElement("div")
toast.innerHTML += `<html>
    <body>
        <div id="chrome_toastr" style="overflow:auto;white-space: pre-wrap;word-wrap: break-word;z-index:99999;color:white;padding: 30px;background-color:#ff0e0e;box-shadow: 3px 3px 3px grey;opacity: 0%;display:none;transition:all 2s ease-in-out;position:fixed;left: 10px;top: 50px;width: 300px;height: 100px;"><p style="text-align:center;" id="chrome_toastr_msg"></p></div>
    </body>
</html>`
document.body.appendChild(toast);
document.querySelector("#chrome_toastr").addEventListener("click", function(e){
    document.querySelector("#chrome_toastr").style.opacity="0%"
    setTimeout(()=>{
        document.querySelector("#chrome_toastr").style.display="none"
    }, 2000)
    
})

let socket 
// if(window.location.href.includes("Test")){

    socket = io('http://localhost:8080',{ transports : ['websocket'] });
    socket.on('connect', function(id) {
        console.log('socket connected');
    });

    socket.on('log', function (data) {
        log = data.log
    })

    socket.on('log_handle', function (data) {
        log = data.log.slice((page_log-1)*perPage_log, page_log*perPage_log)
        log = log.map((el,i) => {
            let newObj = {}
            Object.keys(el).forEach(key => {newObj[key] = el[key]})
            newObj["row"] = (page_log-1)*perPage_log + i
        })
    })

    socket.on('err', function (data) {
        console.log("error")
        let cToastr = document.querySelector("#chrome_toastr")
        cToastr.querySelector("#chrome_toastr_msg").innerText = data.err
        cToastr.style.display = "block"
        cToastr.style.opacity = "70%"
        setTimeout(()=>{cToastr.style.display = "none"}, 10000)
    })

    socket.on("disconnect", () => {
      console.log("disconnected"); // undefined
    });

    
// }
const postRequest = (url, data) => fetch(url, {
      method: "POST",
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify(data)
    }).then((response) => {
      return new Promise((resolve) => response.json()
        .then((json) => resolve({
          status: response.status,
          ok: response.ok,
          json,
        })));
    }).then(({ status, json, ok }) => {
      const message = json.data;
      let color = 'black';
      switch (status) {
        case 400:
          alert(message)
          break;
        case 200:
          return json
          break;
      }
    })

const postFile = (url, file) => fetch(url, {
      method: "POST",
      headers: {'Content-Type': 'application/json'}, 
      body: file
    }).then((response) => {
      return new Promise((resolve) => response.json()
        .then((json) => resolve({
          status: response.status,
          ok: response.ok,
          json,
        })));
    }).then(({ status, json, ok }) => {
      const message = json.data;
      let color = 'black';
      switch (status) {
        case 400:
          alert(message)
          break;
        case 200:
          return json
          break;
      }
    })

function scrape(cmpType, allowDuplicate, actionType) {
    const url1 = "partscheck.com.au";
    const url2 = "partsouq.com";
    // if(!window.location.href.includes(url1)) {
    //     alert(`Url does not contain ${url1}`);
    //     return;
    // }
    console.log(allowDuplicate)
    console.log(typeof allowDuplicate)
    let vin = ""
    let ref = ""
    let customerName = ""
    let dueDate = ""
    let partTextsArr = ""
    let rows = document.getElementsByClassName("lineRow");

    // vehicleInfos
    let vehicleInfos = document.getElementsByClassName("quoteTitleContainer")
    let vehicleInfo;

    for(let i = 0; i < vehicleInfos.length ; i++){
        if(vehicleInfos[i].previousElementSibling.innerText == "Vehicle Info")
            vehicleInfo = vehicleInfos[i]
        if(vehicleInfos[i].previousElementSibling.innerText == "General Info"){

            let temp = vehicleInfos[i]
            let tempColumns = temp.getElementsByClassName("quoteTitleContent");
            if(tempColumns[0].innerText){
                let innerText = tempColumns[0].innerText
                console.log(innerText)
                dueDate = innerText.split("\n")[0] +" "+ innerText.split("\n")[2]
            }

            if(tempColumns[1].innerText){
                let innerText = tempColumns[1].innerText
                customerName = innerText.split("\n")[0] 
            } 
            ref = tempColumns[3].innerText
        }
    }
    // column for vehicle.
    let columnsForVehicles = vehicleInfo.getElementsByClassName("quoteTitle");
    let columnsForVehicle = ""

    for(let i = 0; i < columnsForVehicles.length ; i++){

        columnsForVehicle += "," + columnsForVehicles[i].innerText
    }

    // data for vehicle.
    let dataForVehicles = vehicleInfo.getElementsByClassName("quoteTitleContent")
    let dataForVehicle = ""

    for(let i = 0; i < dataForVehicles.length; i++){

        // check if the VIN input tag
        if(dataForVehicles[i].childElementCount > 0){
            dataForVehicle += "," + dataForVehicles[i].firstChild.defaultValue
            vin = dataForVehicles[i].firstChild.defaultValue
        }
        else{
            dataForVehicle += "," + (dataForVehicles[i].innerText ? dataForVehicles[i].innerText : "NA")
        }
    }

    // column name for csv.
    let columnsForTable = "Row,PartText,PartNumber"
    partTextsArr += columnsForTable + columnsForVehicle + "\n";

    // loop through table rows.
    for(let i = 0; i < rows.length ; i++){

        let partNumber = rows[i].getElementsByClassName("partNr").length>0 ? rows[i].getElementsByClassName("partNr")[0].value:""
        let partText = rows[i].dataset.parttext || ""
        partText = partText.replace(/\s\s+/g, ' ');
        // Table rows.
        let rowText = i + ","
                     + partText + ","
                     + partNumber
                     + dataForVehicle
                     + "\n";

        // Add table rows
        partTextsArr += rowText;
    }
    ref = ref.replace("#","_")

    postRequest(`http://localhost:9090/scrape`,
    {
        ref: ref,
        vin: vin,
        customerName: customerName,
        dueDate: dueDate,
        cmpType: cmpType,
        allowDuplicate: allowDuplicate,
        actionType: actionType,
        data: partTextsArr,
        descChange:false
    }).then(res => {
        if(actionType == 3) queViewer()
    })
}

function scrapePartNr(saveFormat) {

    let partNumbers = "";
    let partNumbersArr = [];

    var partNumInputs = document.getElementsByClassName('partNr');
    for (let index = 0; index < partNumInputs.length; index++) {
        const element = partNumInputs[index];
        let partNumber = element.value;

        partNumber = partNumber.replace(" ", "");
        partNumber = partNumber.replace("-", "");

        partNumbers += partNumber + '\n';
        partNumbersArr.push([partNumber]);
    }

    if(saveFormat == "csv") {
        downloadCSVv1("PCIBC_v1", partNumbersArr);
    } else {
        downloadTXTv1(partNumbers, "PCIBC_v1", "txt");
    }
}

function downloadCSVv1(filename, rows) {
    var processRow = function (row) {
        var finalVal = '';
        for (var j = 0; j < row.length; j++) {
            var innerValue = row[j] === null ? '' : row[j].toString();
            if (row[j] instanceof Date) {
                innerValue = row[j].toLocaleString();
            };
            var result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0)
                result = '"' + result + '"';
            if (j > 0)
                finalVal += ',';
            finalVal += result;
        }
        return finalVal + '\n';
    };

    var csvFile = '';
    for (var i = 0; i < rows.length; i++) {
        csvFile += processRow(rows[i]);
    }

    var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function downloadTXTv1(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }
}

function createDBfromPage(){

    var aTags = document.querySelectorAll("tr[style='color:']")
    var urls = []
    for (aTag of aTags){
        var a = aTag.querySelectorAll("a")[0]
        urls.push(a.href)
    }
  
    postRequest("http://localhost:9090/create_db_from_page",{urls:urls, cookie:document.cookie})
}

function createDBfromList(){
    postRequest("http://localhost:9090/create_db_from_list",{cookie:document.cookie})
}

function processDB(){
    postRequest("http://localhost:9090/process_db",{})
}

async function queViewer(){

    if(!queWindow || queWindow.closed){
        queWindow = window.open("", "Que viewer", "height=950,width=1200,status=yes,toolbar=no,menubar=no,location=no,titlebar=no");
        await initWindow_que(queWindow)
    } else {
        await renderWindow_que(queWindow)}

}

async function initWindow_que(windowHandle){

    let data = await postRequest(`http://localhost:9090/get_all_que`,{
        page: 1,
        perPage:10
    })
    let trList = ""
    data.que.forEach((el,i) => {
        trList += `<tr><td>${el.row+1}</td><td>${el.csName}</td><td>${el.ref}</td><td>${el.vin}</td><td>${el.dueDate}</td><td><button id="remove_${i}">Remove</button></td></tr>`
    })
    console.log(trList)
    windowHandle.document.write(`
        <head>
            <style>
            table {
              border-collapse: collapse;
              width: 100%;
            }

            td {
              text-align: left;
              padding: 8px;
            }
            th {
                background-color: black;
                text-align: left;
                padding: 8px;
                color:white;
            }
            button {
                background-color: #04AA6D!important;
                border-radius: 5px;
                padding: 6px 18px;
                color: white;
                border-color: white;
                width: 100px;
                cursor:pointer;
            }

            tr:nth-child(even) {background-color: #f2f2f2;}

            .pagination {
              display: inline-block;
            }

            .pagination a {
              color: black;
              float: left;
              padding: 8px 16px;
              text-decoration: none;
              transition: background-color .3s;
              border: 1px solid #ddd;
              cursor: pointer;
            }

            .pagination a.active {
              background-color: #4CAF50;
              color: white;
              border: 1px solid #4CAF50;
            }

            .pagination a:hover:not(.active) {background-color: #ddd;}
            select {
                position: relative;
                left: 10px;
                top: -13px;
                background-color: white;
                color: black;
                padding: 9px 6px;
                border: 0.5px solid black;
                box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
                -webkit-appearance: button;
                appearance: button;
                outline: none
                margin: 2px;
                cursor: pointer;
              }
            </style>
        </head>

        <body>
        <h2 style="text-align:center;">Que Viewer</h2>
        <div style=" display: flex; gap: 15px; ">
            <div style=" flex-grow: 1; ">
                <table style=" width: 100%; text-align: left; ">
                    <tbody>
                        <tr>
                            <th>No</th>
                            <th>Customer</th>
                            <th>Ref</th>
                            <th>Vin</th>
                            <th>Due Date</th>
                            <th></th>
                        </tr>
                        ${trList}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
        <div style="text-align:center;margin-top:10px;">
            <div class="pagination">
              <a id="prev">&laquo;</a>
              <a id="page">1</a>
              <a id="next">&raquo;</a>
            </div>
            <select id="perPage">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="20">50</option>
            </select>
        </div>
        </body>
    `);

    windowHandle.document.addEventListener('keydown', async (e) => {
        e = e || window.event;
        if(e.keyCode == 116){
            e.preventDefault();
            await renderWindow_que(windowHandle)
        }

    });
    data.que.forEach((el, i) => {
        windowHandle.document.querySelector(`#remove_${i}`).addEventListener("click", async (e)=>{
            e.preventDefault()
            await postRequest(`http://localhost:9090/remove_from_que`,{
                ref: el.ref,
                vin: el.vin
            })
            await renderWindow_que(windowHandle)
        })
    })
    windowHandle.document.querySelector("#prev").addEventListener("click", async(e) => {
        e.preventDefault()
        page_que = (page_que - 1) > 0 ? (page_que -1) : 1
        windowHandle.document.querySelector('#page').innerText = page_que

        await renderWindow_que(windowHandle)
    })

    windowHandle.document.querySelector("#next").addEventListener("click", async(e) => {
        e.preventDefault()
        page_que++
        windowHandle.document.querySelector('#page').innerText = page_que

        await renderWindow_que(windowHandle)
    })

    windowHandle.document.querySelector("#perPage").addEventListener("change", async(e) => {
        e.preventDefault()
        perPage_que = windowHandle.document.querySelector('#perPage').value

        await renderWindow_que(windowHandle)
    })

}

async function renderWindow_que(windowHandle){

    let data = await postRequest(`http://localhost:9090/get_all_que`,{
        page:page_que,
        perPage:perPage_que
    })

    let trList = ""
    data.que.forEach((el,i) => {
        trList += `<tr><td>${el.row+1}</td><td>${el.csName}</td><td>${el.ref}</td><td>${el.vin}</td><td>${el.dueDate}</td><td><button id="remove_${i}">Remove</button></td></tr>`
    })

    let tableBody = windowHandle.document.querySelector("body > div > div > table > tbody");
    tableBody.innerHTML = "<tr><th>No</th><th>Customer</th><th>Ref</th><th>Vin</th> <th>Due Date</th><th></th></tr>";
    tableBody.innerHTML += trList

    data.que.forEach((el, i) => {
        windowHandle.document.querySelector(`#remove_${i}`).addEventListener("click", async (e)=>{
            await postRequest(`http://localhost:9090/remove_from_que`,{
                ref: el.ref,
                vin: el.vin
            })
            await renderWindow_que(windowHandle)
        })
    })
}


async function logViewer(){
    console.log(log)

    if(!logWindow || logWindow.closed){
        logWindow = window.open("", "Log viewer", "height=950,width=1200,status=yes,toolbar=no,menubar=no,location=no,titlebar=no");
        initWindow_log(logWindow)
    } else {
        renderWindow_log(logWindow)
    }
}

async function initWindow_log(windowHandle){
    console.log("init")
    socket.emit("log",{page:page_log, perPage:perPage_log})
    setTimeout(()=>{
        let trList = ""
        log.forEach((el,i) => {
            trList += `<tr><td>${(page_log-1)*perPage_log+i+1}</td><td>${el.csName}</td><td>${el.ref}</td><td>${el.vin}</td><td>${el.dueDate}</td><td>${el.pc? "Completed":"Processing"}</td><td>${el.ps? "Completed":"Processing"}</td><td>${el.compare?"Completed":"Processing"}</td><td>${el.compare_filter? "Completed":"Processing"}</td><td>${el.ibc?"Completed":"Processing"}</td><td>${el.status==2?"Competed":(el.status == 1?"Processing":"Not started")}</td><td><button id="remove_${i}">Remove</button></td></tr>`
        })
        windowHandle.document.write(`
            <head>
                <style>
                table {
                  border-collapse: collapse;
                  width: 100%;
                }

                td {
                  text-align: left;
                  padding: 8px;
                }
                th {
                    background-color:  #04AA6D;
                    text-align: left;
                    padding: 8px;
                    color:white;
                }
                button {
                    background-color: #04AA6D!important;
                    border-radius: 5px;
                    padding: 6px 18px;
                    color: white;
                    border-color: white;
                    width: 100px;
                    cursor:pointer;
                }

                tr:nth-child(even) {background-color: #f2f2f2;}

                .pagination {
                  display: inline-block;
                }

                .pagination a {
                  color: black;
                  float: left;
                  padding: 8px 16px;
                  text-decoration: none;
                  transition: background-color .3s;
                  border: 1px solid #ddd;
                  cursor: pointer;
                }

                .pagination a.active {
                  background-color: #4CAF50;
                  color: white;
                  border: 1px solid #4CAF50;
                }

                .pagination a:hover:not(.active) {background-color: #ddd;}
                select {
                    position: relative;
                    left: 10px;
                    top: -13px;
                    background-color: white;
                    color: black;
                    padding: 9px 6px;
                    border: 0.5px solid black;
                    box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
                    -webkit-appearance: button;
                    appearance: button;
                    outline: none
                    margin: 2px;
                    cursor: pointer;
                  }
                </style>
            </head>

            <body>
            <h2 style="text-align:center;">Log Viewer</h2>
            <div style=" display: flex; gap: 15px; ">
                <div style=" flex-grow: 1; ">
                    <table style=" width: 100%; text-align: left; ">
                        <tbody>
                            <tr>
                                <th>No</th>
                                <th>Customer</th>
                                <th>Ref</th>
                                <th>Vin</th>
                                <th>Due Date</th>
                                <th>PC</th>
                                <th>PS</th>
                                <th>Compare</th>
                                <th>Filter</th>
                                <th>IBC</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                            ${trList}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
            <div style="text-align:center;margin-top:10px;">
                <div class="pagination">
                  <a id="prev">&laquo;</a>
                  <a id="page">1</a>
                  <a id="next">&raquo;</a>
                </div>
                <select id="perPage">
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="20">50</option>
                </select>
            </div>
            </body>
        `);

        windowHandle.document.addEventListener('keydown',  (e) => {
            e = e || window.event;
            if(e.keyCode == 116){
                e.preventDefault();
                renderWindow_log(windowHandle)
            }
        });
        log.forEach((el, i) => {
            windowHandle.document.querySelector(`#remove_${i}`).addEventListener("click", async (e)=>{
                e.preventDefault()
                await postRequest(`http://localhost:9090/remove_from_log`,{
                    ref: el.ref,
                    vin: el.vin
                })
                 renderWindow_log(windowHandle)
            })
        })
        windowHandle.document.querySelector("#prev").addEventListener("click", (e) => {
            e.preventDefault()
            page_log = (page_log - 1) > 0 ? (page_log -1) : 1
            windowHandle.document.querySelector('#page').innerText = page_log

             renderWindow_log(windowHandle)
        })

        windowHandle.document.querySelector("#next").addEventListener("click", (e) => {
            e.preventDefault()
            page_log++
            windowHandle.document.querySelector('#page').innerText = page_log

            renderWindow_log(windowHandle)
        })

        windowHandle.document.querySelector("#perPage").addEventListener("change", (e) => {
            e.preventDefault()
            perPage_log = windowHandle.document.querySelector('#perPage').value

            renderWindow_log(windowHandle)
        })
    }, 500)
}

async function renderWindow_log(windowHandle){
    console.log("render")
    socket.emit("log",{page:page_log, perPage:perPage_log})

    let tableBody = windowHandle.document.querySelector("body > div > div > table > tbody");
    tableBody.innerHTML = `<p style="text-alig:center;">Loading logs...</p>`

    setTimeout(() => {
        let trList = ""
         log.forEach((el,i) => {
            trList += `<tr><td>${(page_log-1)*perPage_log+i+1}</td><td>${el.csName}</td><td>${el.ref}</td><td>${el.vin}</td><td>${el.dueDate}</td><td>${el.pc? "Completed":"Processing"}</td><td>${el.ps? "Completed":"Processing"}</td><td>${el.compare?"Completed":"Processing"}</td><td>${el.compare_filter? "Completed":"Processing"}</td><td>${el.ibc?"Completed":"Processing"}</td><td>${el.status==2?"Competed":(el.status == 1?"Processing":"Not started")}</td><td><button id="remove_${i}">Remove</button></td></tr>`
        })

        tableBody.innerHTML = "<tr><th>No</th><th>Customer</th><th>Ref</th><th>Vin</th><th>Due Date</th><th>PC</th><th>PS</th><th>Compare</th><th>Filter</th><th>IBC</th><th>Status</th><th></th></tr>";
        tableBody.innerHTML += trList

        log.forEach((el, i) => {
            windowHandle.document.querySelector(`#remove_${i}`).addEventListener("click", async (e)=>{
                await postRequest(`http://localhost:9090/remove_from_log`,{
                    ref: el.ref,
                    vin: el.vin
                })
                renderWindow_log(windowHandle)
            })
        })
    }, 500)
    
}

async function descChanger(){
     if(!descWindow || descWindow.closed){
        descWindow = window.open("", "Desc Changer", "height=950,width=600,status=yes,toolbar=no,menubar=no,location=no,titlebar=no");
        await initWindow_desc(descWindow)
    } else {
        // await renderWindow_desc(logWindow)
    }
}
function initWindow_desc(windowHandle) {
    let vin = ""
    let ref = ""
    let customerName = ""
    let dueDate = ""
    let partTextsArr = ""
    let rows = document.getElementsByClassName("lineRow");

    // vehicleInfos
    let vehicleInfos = document.getElementsByClassName("quoteTitleContainer")
    let vehicleInfo;

    for(let i = 0; i < vehicleInfos.length ; i++){
        if(vehicleInfos[i].previousElementSibling.innerText == "Vehicle Info")
            vehicleInfo = vehicleInfos[i]
        if(vehicleInfos[i].previousElementSibling.innerText == "General Info"){

            let temp = vehicleInfos[i]
            let tempColumns = temp.getElementsByClassName("quoteTitleContent");
            if(tempColumns[0].innerText){
                let innerText = tempColumns[0].innerText
                dueDate = innerText.split("\n")[0] +" "+ innerText.split("\n")[2]
            }

            if(tempColumns[1].innerText){
                let innerText = tempColumns[1].innerText
                customerName = innerText.split("\n")[0] 
            } 
            ref = tempColumns[3].innerText
        }
    }
    // column for vehicle.
    let columnsForVehicles = vehicleInfo.getElementsByClassName("quoteTitle");
    let columnsForVehicle = ""

    for(let i = 0; i < columnsForVehicles.length ; i++){

        columnsForVehicle += "," + columnsForVehicles[i].innerText
    }

    let columnsForTable = "Row,PartText,PartNumber"

    // data for vehicle.
    let dataForVehicles = vehicleInfo.getElementsByClassName("quoteTitleContent")
    let dataForVehicle = ""

    for(let i = 0; i < dataForVehicles.length; i++){

        // check if the VIN input tag
        if(dataForVehicles[i].childElementCount > 0){
            dataForVehicle += "," + dataForVehicles[i].firstChild.defaultValue
            vin = dataForVehicles[i].firstChild.defaultValue
        }
        else{
            dataForVehicle += "," + (dataForVehicles[i].innerText ? dataForVehicles[i].innerText : "NA")
        }
    }
    let partTextList = []
    // loop through table rows.
    for(let i = 0; i < rows.length ; i++){

        let partNumber = rows[i].getElementsByClassName("partNr").length>0 ? rows[i].getElementsByClassName("partNr")[0].value:""
        let partText = rows[i].dataset.parttext || ""
        partText = partText.replace(/\s\s+/g, ' ');
        // Table rows.
        let rowText = i + ","
                     + partText + ","
                     + partNumber
                     + dataForVehicle
                     + "\n";
        partTextList.push(partText)
    }

    let trList = ""
     partTextList.forEach((el,i) => {

        trList += `<tr><td>${i+1}</td><td>${el}</td><td><input id="parttext_${i}" value="${el}"></input></td></tr>`
    })
    windowHandle.document.write(`
        <head>
            <style>
            table {
              border-collapse: collapse;
              width: 100%;
            }

            td {
              text-align: left;
              padding: 8px;
            }
            th {
                background-color:  #04AA6D;
                text-align: left;
                padding: 8px;
                color:white;
            }
            button {
                background-color: #04AA6D!important;
                border-radius: 5px;
                padding: 6px 18px;
                color: white;
                border-color: white;
                width: 100px;
                cursor:pointer;
            }

            tr:nth-child(even) {background-color: #f2f2f2;}

            .pagination {
              display: inline-block;
            }

            .pagination a {
              color: black;
              float: left;
              padding: 8px 16px;
              text-decoration: none;
              transition: background-color .3s;
              border: 1px solid #ddd;
              cursor: pointer;
            }

            .pagination a.active {
              background-color: #4CAF50;
              color: white;
              border: 1px solid #4CAF50;
            }

            .pagination a:hover:not(.active) {background-color: #ddd;}
            select {
                position: relative;
                left: 10px;
                top: -13px;
                background-color: white;
                color: black;
                padding: 9px 6px;
                border: 0.5px solid black;
                box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
                -webkit-appearance: button;
                appearance: button;
                outline: none
                margin: 2px;
                cursor: pointer;
              }
            </style>
        </head>

        <body>
            <h2 style="text-align:center;">Descrioption Changer</h2>
            <div style=" display: flex; gap: 15px;">
                <div style=" flex-grow: 1; ">
                    <table style=" width: 100%; text-align: left; ">
                        <tbody>
                            <tr>
                                <th>No</th>
                                <th>Current</th>
                                <th>Modified</th>
                            </tr>
                            ${trList}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
            <div style="text-align:center;margin-top:20px;">
                <hr>
                <div style="margin-top:5px;padding-top:20px;">
                  <div style="width:50%; float: left;">
                    <select name="cmpType" id="cmpType">
                        <option value="1">Part Code</option>
                        <option value="2" selected>Description</option>
                        <option value="3">All</option>
                    </select>
                  </div>
                  <div style="width:50%; float: left;">
                    <select name="actionType" id="actionType">
                      <option value="0">Scrape Only</option>
                      <option value="1">Compare Only</option>
                      <option value="2">Scrape & Compare</option>
                      <option value="3">Add to Que</option>
                  </select>
                  </div>
                    <input type="checkbox" style="padding:10px" checked="true" id="allow_duplicate">Allow Duplicate</input>
                  <div>
                    <button style="cursor: pointer; margin-top:5px;" class="btn" id="scrape">Request
                    </button>
                  </div>
                </div>
            </div> 
        </body>
    `);
    windowHandle.document.querySelector("#cmpType").addEventListener("change", async(e) => {
        e.preventDefault()
        descCmpType = windowHandle.document.querySelector('#cmpType').value
    })
    windowHandle.document.querySelector("#actionType").addEventListener("change", async(e) => {
        e.preventDefault()
        descActionType = windowHandle.document.querySelector('#actionType').value
    })
    windowHandle.document.querySelector("#allow_duplicate").addEventListener("change", async(e) => {
        e.preventDefault()
        descAllowDuplicate = windowHandle.document.querySelector('#allow_duplicate').checked
    })
    windowHandle.document.querySelector("#scrape").addEventListener("click", async(e) => {
       
        e.preventDefault()
        let modifiedList = windowHandle.document.querySelectorAll("body > div > div > table > tbody > tr > td:nth-child(3) > input")
        partTextsArr = columnsForTable + columnsForVehicle + "\n";
        for(let i = 0; i < rows.length ; i++){

        let partNumber = rows[i].getElementsByClassName("partNr").length>0 ? rows[i].getElementsByClassName("partNr")[0].value:""
        let partText = modifiedList[i].value
        partText = partText.replace(/\s\s+/g, ' ');
        // Table rows.
        let rowText = i + ","
                     + partText + ","
                     + partNumber
                     + dataForVehicle
                     + "\n";
        // Add table rows
        partTextsArr += rowText;
    }
    ref = ref.replace("#","_")
       postRequest(`http://localhost:9090/scrape`,
        {
            ref: ref,
            vin: vin,
            customerName: customerName,
            dueDate: dueDate,
            cmpType: descCmpType,
            allowDuplicate: descAllowDuplicate,
            actionType: descActionType,
            data: partTextsArr,
            descChange: true
        }).then(res => {
            if(descActionType == 3) queViewer()
        })
    })

}

function scrapePS(vin) {
    if(vin == ""){
        alert("Please check vin");
        return
    } 
    postRequest(`http://localhost:9090/scrape_ps`,{vin:vin})
}

var readyStateCheckInterval = setInterval(function() {
    if (document.readyState === "complete") {
        clearInterval(readyStateCheckInterval);
        modifyConfig();
    }
}, 10);

function modifyConfig(){
    if(!window.location.href.includes("partsouq.com")) {
        console.log(`Url does not contain partsouq.com`);
        return;
    }

    let brandTag = document.querySelector(".breadcrumb > li:nth-child(3)")
    let brandText = brandTag.innerText

    let categoryTag = document.querySelector('.breadcrumb > li:last-child')
    let categoryText = categoryTag.innerText

    let categories = document.querySelectorAll(".vehicle-tg > tbody > tr > td");
    let categoryOptions = ""
    categories.forEach(el => {
        categoryOptions += `<option value=${el.innerText}>${el.innerText}</option>`
    })
    let modal = document.querySelector(".newModal")
    if(!modal){
        modal = document.createElement("div");
        modal.innerHTML += `<div class="newModal" id="0" style="display: none;position: absolute;height: 100%;width: 100vw;background-color: rgba(0, 0, 0, 0.72);top: 0px;z-index: 999999;"><style>.modal-btn {width:200px; text-align:center;background-color: #4CAF50;padding: 15px;color: white;font-weight: bold;border-radius: 5px;font-size: 20px;cursor: pointer;}</style><div style="height: 200px;width: 500px;background-color: white;position: fixed;top: 50%;left: 50%;-webkit-transform: translate(-50%, -50%);transform: translate(-50%, -50%);"><div style="height: 50px;width: 100%;background-color: gray;display: flex;justify-content: center;align-items: center;font-size: 20px;color: white;font-weight: bold;"><select style="color:black;text-align:center;"  id="category_select">${categoryOptions}</select><button style="position:relative;right:-100px;color:black" id="closeBtn">*</button></div><div style="margin-top:10px;width: 100%;display: flex;justify-content: center;align-items: center;gap: 25px;"><div id="addToFilter" class="modal-btn" style="background-color: #4CAF50;">Add(Filter)</div><div id="removeFromFilter" class="modal-btn" style="background-color: red">Remove(Filter)</div></div><div style="margin-top:10px;width: 100%;display: flex;justify-content: center;align-items: center;gap: 25px;"><div id="addToIgnore" class="modal-btn" style="background-color: #4CAF50;">Add(Ignore)</div><div id="removeFromIgnore" class="modal-btn" style="background-color: red">Remove(Ignnore)</div></div></div></div>`
        document.body.appendChild(modal);
        modal.querySelector("#closeBtn").addEventListener('click', function(){
            document.querySelector(".newModal").style.display = "none"
        })
        modal.querySelector('#addToFilter').addEventListener('click', function(){
            let subCat = document.querySelector(".newModal").id || "0"
            categoryText = document.querySelector("#category_select").value
            postRequest(`http://localhost:9090/modify_config`,{brand: brandText,catText:categoryText,subCat:subCat, actionType:0})
            document.querySelector(".newModal").style.display = "none"
        })
        modal.querySelector('#removeFromFilter').addEventListener('click', function(){
            let subCat = document.querySelector(".newModal").id || "0"
            categoryText = document.querySelector("#category_select").value
            postRequest(`http://localhost:9090/modify_config`,{brand: brandText,catText:categoryText,subCat:subCat, actionType:1})
            document.querySelector(".newModal").style.display = "none"
        })
        modal.querySelector('#addToIgnore').addEventListener('click', function(){
            let subCat = document.querySelector(".newModal").id || "0"
            categoryText = document.querySelector("#category_select").value
            postRequest(`http://localhost:9090/modify_config`,{brand: brandText,catText:categoryText,subCat:subCat, actionType:2})
            document.querySelector(".newModal").style.display = "none"
        })
        modal.querySelector('#removeFromIgnore').addEventListener('click', function(){
            let subCat = document.querySelector(".newModal").id || "0"
            categoryText = document.querySelector("#category_select").value
            postRequest(`http://localhost:9090/modify_config`,{brand: brandText,catText:categoryText,subCat:subCat, actionType:3})
            document.querySelector(".newModal").style.display = "none"
        })
    }

    window.document.addEventListener('keydown', async (e) => {
        e = e || window.event;
        if(e.keyCode == 27){
            document.querySelector(".newModal").style.display = "none"
        }
        
    });

    let subCategories = document.querySelectorAll(".thumb-boss")
    subCategories.forEach((el,i)=>{
        let subCatTextTemp = el.innerText || ""
        let subCatText = subCatTextTemp.split(":")[0] || ""
         el.addEventListener("contextmenu",function(event){
            event.preventDefault();
            // let options = document.querySelectorAll("category_select > option")
            // let index = options.findIndex(optionTag => optionTag.value == categoryText)
            // document.getElementById("category_select").options.selectedIndex = index;
            document.querySelector("#category_select").value = categoryText
            document.querySelector(".newModal").id = subCatText
            document.querySelector(".newModal").style.display = "block"

        })
    })
    alert("Ready to Modify config")
}


async function handtypeList(){
     if(!handtypeWindow || handtypeWindow.closed){
        handtypeWindow = window.open("", "Handtype list", "height=950,width=600,status=yes,toolbar=no,menubar=no,location=no,titlebar=no");
        await initWindow_handtype_list(handtypeWindow)
    } else {
        // await renderWindow_desc(logWindow)
    }
}
function initWindow_handtype_list(windowHandle) {
    let partTextsArr = ""
    windowHandle.document.write(`
        <head>
            <style>
            table {
              border-collapse: collapse;
              width: 100%;
            }

            td {
              text-align: center;
              padding: 8px;
            }
            th {
                background-color:  #04AA6D;
                text-align: left;
                padding: 8px;
                color:white;
                text-align:center;
            }
            button #file-btn {
                background-color: #04AA6D!important;
                border-radius: 5px;
                padding: 6px 18px;
                color: white;
                border-color: white;
                width: 100px;
                cursor:pointer;
            }

            tr:nth-child(even) {background-color: #f2f2f2;}

            .pagination {
              display: inline-block;
            }

            .pagination a {
              color: black;
              float: left;
              padding: 8px 16px;
              text-decoration: none;
              transition: background-color .3s;
              border: 1px solid #ddd;
              cursor: pointer;
            }

            .pagination a.active {
              background-color: #4CAF50;
              color: white;
              border: 1px solid #4CAF50;
            }

            .pagination a:hover:not(.active) {background-color: #ddd;}
            select {
                position: relative;
                left: 10px;
                top: -13px;
                background-color: white;
                color: black;
                padding: 9px 6px;
                border: 0.5px solid black;
                box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
                -webkit-appearance: button;
                appearance: button;
                outline: none
                margin: 2px;
                cursor: pointer;
              }
            </style>
        </head>

        <body>
            <h2 style="text-align:center;">Descrioption Changer</h2>
            <hr>
            <div style="display:flex;text-align:center;">Brand<input style="width:40%" type="text" id="brand"></input>Vin<input style="width:40%" type="text" id="vin"></input></div>
            <hr>
            <div style=" display: flex; gap: 15px;">
                <div style=" flex-grow: 1; ">
                    <table style=" width: 100%; text-align: left; ">
                        <tbody>
                            <tr>
                                <th>No</th>
                                <th style="text-align:center;">Description</th>
                                <th style="text-align:center;">Number</th>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="text-align:center;">
                <button type="button" id="add_row">Add row</button>
            </div>
            <hr>
            <form style="text-align:center;">
                <span id="file-btn">Upload</span>
                <input id="handtypeFile" type="file" style="display:none"></input>
            </form>
            <div style="text-align:center;margin-top:20px;">
                <hr>
                <div style="margin-top:5px;padding-top:20px;">
                  <div style="width:50%; float: left;">
                    <select name="cmpType" id="cmpType">
                        <option value="1" selected>Part Code</option>
                        <option value="2" selected>Description</option>
                    </select>
                  </div>
                  <div style="width:50%; float: left;">
                    <select name="actionType" id="actionType">
                      <option value="0">Scrape Only</option>
                      <option value="1">Compare Only</option>
                      <option value="2">Scrape & Compare</option>
                  </select>
                  </div>
                    <input type="checkbox" style="padding:10px" id="allow_duplicate">Allow Duplicate</input>
                  <div>
                    <button style="cursor: pointer; margin-top:5px;" class="btn" id="scrape">Request
                    </button>
                  </div>
                </div>
            </div> 
        </body>
    `);
    windowHandle.document.querySelector("#cmpType").addEventListener("change", async(e) => {
        e.preventDefault()
        handCmpType = windowHandle.document.querySelector('#cmpType').value
    })
    windowHandle.document.querySelector("#add_row").addEventListener("click", async(e) => {
        e.preventDefault()
        let tbody = windowHandle.document.querySelector("body > div > div > table > tbody")
        let trsLength = tbody.querySelectorAll("tr").length
        let tr = windowHandle.document.createElement('tr')

        tr.innerHTML += `<tr><td>${trsLength}</td><td style="text-align:center;"><input style="width:90%" id="parttext_${trsLength}" ></input></td><td style="text-align:center;"><input style="width:90%" id="partnumber_${trsLength}" ></input></td></tr>`
        tbody.appendChild(tr)
    })
    windowHandle.document.querySelector("#actionType").addEventListener("change", async(e) => {
        e.preventDefault()
        handActionType = windowHandle.document.querySelector('#actionType').value
    })
    windowHandle.document.querySelector("#allow_duplicate").addEventListener("change", async(e) => {
        e.preventDefault()
        handAllowDuplicate = windowHandle.document.querySelector('#allow_duplicate').checked
    })
    windowHandle.document.querySelector("#scrape").addEventListener("click", async(e) => {
       
        e.preventDefault()
        let partTextlist = windowHandle.document.querySelectorAll("body > div > div > table > tbody > tr > td:nth-child(2) > input")
        let partNumberlist = windowHandle.document.querySelectorAll("body > div > div > table > tbody > tr > td:nth-child(3) > input")
        let brand = windowHandle.document.querySelector("#brand").value
        let vin = windowHandle.document.querySelector("#vin").value
        partTextsArr = "Row,PartText,PartNumber,Brand" + "\n";
        let realIndex = 0;
        for(let i = 0; i < partTextlist.length ; i++){

            let partNumber = partNumberlist[i].value || ""
            let partText = partTextlist[i].value
            partText = partText.replace(/\s\s+/g, ' ');
            if(partText !== ""){
                // Table rows.
                let rowText = realIndex + ","
                             + partText + ","
                             + partNumber + ","
                             + brand
                             + "\n";
                // Add table rows
                partTextsArr += rowText;
                realIndex++
            }
            
        }
       //  var textFile = windowHandle.document.querySelector('#textFile')
       //  var numberFile = windowHandle.document.querySelector('#numberFile')

       //  var data = new FormData()
       //  data.append('textFile', textFile.files[0])
       //  data.append('numberFile', numberFile.files[0])
       //  data.append('vin', vin)
       //  data.append('cmpType', handCmpType)
       //  data.append('allowDuplicate', handAllowDuplicate)
       //  data.append('actionType', handActionType)
       //  data.append('brand', brand)
       //  data.append('data', partTextsArr)
       //  data.append('vin', vin)

       // postFile(`http://localhost:9090/scrape_handtype`, data).then(res => {
       //  })
      // postRequest(`http://localhost:9090/scrape_handtype`, {
      //   vin:vin,
      //   cmpType:handCmpType,
      //   allowDuplicate,handAllowDuplicate,
      //   actionType, handActionType,
      //   brand, brand,
      //   data, partTextsArr
      // }).then(res => {
      //   })
    })

}

chrome.runtime.onMessage.addListener( // this is the message listener
    function(request, sender, sendResponse) {
        if (request.message === "scrape_part_nr") {
            scrapePartNr(request.saveFormat)
        }
        if (request.message === "scrape_partsouq") {
            scrapePS(request.vin)
        }
        if (request.message === "scrape") {
            scrape( request.cmpType, request.allowDuplicate, request.actionType)
        }
        if (request.message === "create_db_from_page") {
            createDBfromPage()
        }
        if (request.message === "create_db_from_list") {
            createDBfromList()
        }
        if (request.message === "process_db") {
            processDB()
        }
        if (request.message === "log_viewer") {
            logViewer()
        }
        if (request.message === "que_viewer") {
            queViewer()
        }
        if (request.message === "desc_change") {
            descChanger()
        }
        if (request.message === "modify_config") {
            modifyConfig()
        }
        if (request.message === "handtype_list") {
            handtypeList()
        }
    }
);

