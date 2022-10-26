

scrape_part_nr.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "scrape_part_nr",
                saveFormat: saveFormatSelect.value.toString()
            }, function(response) {})
    })
});


scrape_partsouq.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "scrape_partsouq",
                vin: vin.value.toString(),
            }, function(response) {})
    })
});

scrape.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "scrape",
                cmpType: cmpType.value.toString(),
                allowDuplicate: allow_duplicate.checked,
                actionType: actionType.value.toString(),
            }, function(response) {})
    })
});

create_db_from_page.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "create_db_from_page"
            }, function(response) {})
    })
});

create_db_from_list.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "create_db_from_list"
            }, function(response) {})
    })
});

process_db.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "process_db"
            }, function(response) {})
    })
});

log_viewer.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "log_viewer"
            }, function(response) {})
    })
});

que_viewer.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "que_viewer"
            }, function(response) {})
    })
});

desc_change.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "desc_change"
            }, function(response) {})
    })
});

modify_config.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "modify_config"
            }, function(response) {})
    })
});

handtype_list.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, 
            {
                message: "handtype_list"
            }, function(response) {})
    })
});

