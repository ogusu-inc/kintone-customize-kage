// crypto-jsライブラリをCDNから読み込む
const script = document.createElement('script');
script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/crypto-js.min.js";
document.head.appendChild(script);

var rowIndex = "";

async function fetchData(hash) {
    const url = 'https://urlshorter.kintonesendback.workers.dev/retrieve'; // Cloudflare WorkerのURL

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hash: hash }) // ハッシュ値をJSON形式で送信
    });

    if (!response.ok) {
        // レスポンスがエラーの場合
        console.error('Error fetching data:', response.status, response.statusText);
        return null;
    }

    const data = await response.json(); // レスポンスデータをJSON形式で取得
    return data; // 取得したデータを返す
}

function extractType(field,key,idx) {
    var query;
    var value;
    var inputtype = 0;
    switch (field[key]["type"]) {
        case 'SINGLE_LINE_TEXT':
            query = `${idx}.kb-field[field-id="${key}"] input`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        case 'RADIO_BUTTON':
            query = `${idx}.kb-field[field-id="${key}"]`;
            value = field[key]["value"];
            inputtype = 2;
            break;
        case 'CHECK_BOX':
            query = `${idx}.kb-field[field-id="${key}"]`;
            value = field[key]["value"];
            if (value) {
                inputtype = 2;
            }
            else{
                inputtype = 0;
            }
            break;
        case 'DROP_DOWN':
            query = `${idx}.kb-field[field-id="${key}"] select`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        // case 'USER_SELECT':
        //     query = `.kb-field[field-id="${key}"] input`;
        //     value = field[key]["value"];
        //     break;
        case 'NUMBER':
            query = `${idx}.kb-field[field-id="${key}"] input`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        // case 'ORGANIZATION_SELECT':
        //     query = `.kb-field[field-id="${key}"] input`;
        //     value = field[key]["value"];
        //     inputtype = 1;
        //     break;
        case 'DATE':
            query = `${idx}.kb-field[field-id="${key}"] input`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        case 'TIME':
            query = `${idx}.kb-field[field-id="${key}"]`;
            value = field[key]["value"];
            inputtype = 3;
            break;
        case 'MULTI_LINE_TEXT':
            query = `${idx}.kb-field[field-id="${key}"] textarea`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        case 'RICH_TEXT':
            query = `${idx}.kb-field[field-id="${key}"] textarea`;
            value = field[key]["value"];
            inputtype = 1;
            break;
        case 'SUBTABLE':
            for (let i = 0; i < field[key]["value"].length; i++) {
                // 項目が複数ある場合は行を追加
                if (i > 0) {
                    var table = document.querySelector(`${idx}table.kb-table[field-id="${key}"]`);
                    var child = document.querySelector(`${idx}table.kb-table[field-id="${key}"] tbody tr`);
                    table.insertRow(child);
                    rowIndex = `tr.kb-scope[row-idx="${i}"] `;
                }
                Object.keys(field[key]["value"][i]).forEach(function(subkey) {
                    if (field[key]["value"][i][subkey]["type"] != 'NONE'){
                        extractType(field[key]["value"][i],subkey,rowIndex);
                    }
                });
            }
            rowIndex = "";
            return;
        default:
            break;
    }
    if (query) {
        switch (inputtype) {
            case 1:
                var inputField = document.querySelector(query);
                inputField.value = value;
            break;
            case 2:
                // var inputcheck = document.querySelector(query + " input[value='" + value + "']");
                var inputchecks = document.querySelectorAll(query + " input");
                inputchecks.forEach(element => {
                    element.checked = false;                    
                });
                var inputcheck = document.querySelector(query + " input[value='" + value + "']");
                var inputField = document.querySelector(query + " .kb-guide");
                inputField.textContent = value;
                inputcheck.checked = true;
            break;
            case 3:
                var inputhour = document.querySelector(query + " .kb-hour select");
                var inputminute = document.querySelector(query + " .kb-minute select");
                inputhour.value = value.split(":")[0];
                inputminute.value = value.split(":")[1];
            break;
            default:
            break;
        }
    }    
}

function getItemdata(item,key){
    var type = item.getAttribute('class');
    switch (type) {
        case 'kb-field':
            // var query = `.kb-field[field-id="${key}"] input, ` +
            //             `.kb-field[field-id="${key}"] select, ` + 
            //             `.kb-field[field-id="${key}"] textarea`;
            const ischeckbox = item.querySelector('.kb-checkbox');
            const isradio = item.querySelector('.kb-radio');
            const istime = item.querySelector('.kb-hour');
            if (ischeckbox) {
                var span = item.querySelector('.kb-checkbox .kb-guide');
                var data = {
                    id : key,
                    type : type,
                    value : span.textContent
                }
                return data;
            }
            if (isradio) {
                var span = item.querySelector('.kb-radio .kb-guide');
                var data = {
                    id : key,
                    type : type,
                    value : span.textContent
                }
                return data;
            }
            if (istime) {
                var inputhour = item.querySelector('.kb-hour select');
                var inputminute = item.querySelector('.kb-minute select');
                var data = {
                    id : key,
                    type : type,
                    value : inputhour.value + ":" + inputminute.value
                }
                return data;
            }
            var query = `input, select, textarea`;
            var inputField = item.querySelector(query);
            var data = {
                id : key,
                type : type,
                value : inputField.value
            }
            return data;
        case 'kb-table':
            var tr = item.querySelectorAll('tr');
            // var query = `.kb-table[field-id="${key}"] > tbody > tr > input, ` + 
            //             `.kb-table[field-id="${key}"] > tbody > tr  > select, ` + 
            //             `.kb-table[field-id="${key}"] > tbody > tr  > textarea, ` + 
            //             `.kb-table[field-id="${key}"] > tbody > tr  > table`;
            var subarray = [];
            tr.forEach(element => {
                var query = `.kb-field, .kb-table`;
                var inputFields = element.querySelectorAll(query);
                var subdata = {};
                inputFields.forEach(input => {
                    var id = input.getAttribute('field-id');
                    subdata[id] = getItemdata(input,id);
                });
                subarray.push(subdata);    
            });
            var data = {
                id : key,
                type : type,
                value : subarray
            }
            return data;    
        default:
            return data;
    }
}

function setItemdata(item,key){
    var type = item.type;
    var value = item.value;
    switch (type) {
        case 'kb-field':
            var query = `${rowIndex}.kb-field[field-id="${key}"] input, ` +
                        `${rowIndex}.kb-field[field-id="${key}"] select, ` + 
                        `${rowIndex}.kb-field[field-id="${key}"] textarea`;
            var ischeckbox = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-checkbox`);
            var isradio = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-radio`);
            var istime = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-hour`);
            if (ischeckbox && value) {
                var inputcheckboxs = document.querySelectorAll(`${rowIndex}.kb-field[field-id="${key}"] input`);
                inputcheckboxs.forEach(element => {
                    element.checked = false;
                });
                var inputcheck = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] input[value=${value}]`);
                var inputField = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-guide`);
                inputField.textContent = value;
                inputcheck.checked = true;
            }
            else if (isradio && value) {
                var inputradios = document.querySelectorAll(`${rowIndex}.kb-field[field-id="${key}"] input`);
                inputradios.forEach(element => {
                    element.checked = false;
                });
                var inputradio = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] input[value=${value}]`);
                var inputField = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-guide`);
                inputField.textContent = value;
                inputradio.checked = true;
            }
            else if (istime) {
                var inputhour = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-hour select`);
                var inputminute = document.querySelector(`${rowIndex}.kb-field[field-id="${key}"] .kb-minute select`);
                inputhour.value = value.split(":")[0];
                inputminute.value = value.split(":")[1];
            }
            else{
                var inputField = document.querySelector(query);
                inputField.value = value;
            }
            break;
        case 'kb-table':
            for (let i = 0; i < value.length; i++) {
                // 項目が複数ある場合は行を追加
                if (i > 0) {
                    var table = document.querySelector(`.kb-table[field-id="${key}"]`);
                    var child = document.querySelector(`.kb-table[field-id="${key}"] tbody tr`);
                    table.insertRow(child);
                    rowIndex = `tr.kb-scope[row-idx="${i}"] `;
                }
                Object.keys(value[i]).forEach(function(subkey) {
                    if (value[i][subkey]["type"] != 'NONE'){
                        setItemdata(value[i][subkey],subkey);
                    }
                });
            }
            rowIndex = "";
            break;
        default:
            break;
    }
    return;
}

var data_loaded = false;

window.addEventListener('load', function () {

    // 現在のページのURLを取得（キーとして使用）
    var pageKey = window.location.href;


    // 監視対象の親要素を取得します
    const parentNode = document.body;  // 親要素が見つからない場合、全体のボディを監視

    // オプション設定
    const config = { childList: true, subtree: true };

    // コールバック関数
    const callback = function(mutationsList, observer) {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                // 追加された要素が指定したクラスを持つかどうかを確認
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 3)  {
                        console.log(node);
                        if (data_loaded) {
                            return;
                        }
                        runAdditionalProcess();
                        observer.disconnect(); // 監視を停止
                        return;
                    }
                });
            }
        }
    };

    // オブザーバーインスタンスを生成
    const observer = new MutationObserver(callback);

    // 監視を開始
    observer.observe(parentNode, config);

    // フォーム構築完了後に実行したい処理
    function runAdditionalProcess() {
        data_loaded = true;
        // 付与されたパラメータを取得
        var params = new URLSearchParams(window.location.search);
        const paramText = params.get('data');
        if(params.size){
            fetchData(paramText)
                .then(data => {
                    if (data) {
                        const password = 'og-ogsas';
                        try {
                            const decryptedData = decrypt(data, password);
                            const jsonparam = JSON.parse(decryptedData);
                            Object.keys(jsonparam).forEach(function(key) {
                                if (jsonparam[key]["type"] != 'NONE'){
                                    extractType(jsonparam,key,"");
                                }
                            });
                        } catch (error) {
                            console.error(error.message);
                        }
                    } else {
                        console.log('No data found for the given hash.');
                    }
                });
        }
        if(!params.size){
            // 前回保存されたデータをlocalStorageから読み込む
            var savedData = localStorage.getItem(pageKey.split('?')[0]);
            if (savedData) {
                var data = JSON.parse(savedData);
                Object.keys(data.fields).forEach(function(key) {
                    setItemdata(data.fields[key],key);
                });
            }
        
        }

        // 保存ボタンを作成
        var saveButton = document.createElement('button');
        saveButton.id = 'saveButton';
        saveButton.textContent = '保存';
        saveButton.style.backgroundColor = 'lime'; // ボタンの色を緑に設定
        saveButton.style.marginLeft = '10px'; // 左側にスペースを追加
        saveButton.style.verticalAlign = 'text-bottom';

        // クリアボタンを作成
        var clearButton = document.createElement('button');
        clearButton.id = 'clearButton';
        clearButton.textContent = 'クリア';
        clearButton.style.backgroundColor = 'red'; // ボタンの色を赤に設定
        clearButton.style.marginLeft = '10px'; // 左側にスペースを追加
        clearButton.style.verticalAlign = 'text-bottom';

        var title = document.querySelectorAll('.kb-injector-header-title');
        if (title[0]) {
            title[0].appendChild(saveButton);
            title[0].appendChild(clearButton);
        }

        // kb-injector-buttonクラスを持つすべての要素を取得
        var buttons = document.querySelectorAll('.kb-injector-button');

        // 各ボタンにクリックイベントを追加
        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                localStorage.removeItem(pageKey.split('?')[0]);
            });
        });

        // 保存ボタンがクリックされたときの処理を追加
        saveButton.addEventListener('click', function () {
            // 警告を表示してユーザーに確認
            var confirmSave = confirm('共有のデバイス（職場のパソコンなど）では保存したデータが第三者に見られる危険があります。それでも保存しますか？');
            if (confirmSave) {
                // IDに'input'を含むすべてのinputタグを取得
                // var inputFields = document.querySelectorAll('input, select, textarea');`.kb-field:not(.kb-unuse), .kb-table(.kb-unuse)`
                var inputFields = document.querySelectorAll('.kb-injector-body > .kb-field:not(.kb-unuse), .kb-injector-body > .kb-table:not(.kb-unuse)');
                var fielddata = {};
                // 取得した要素をログに表示
                inputFields.forEach(element => {
                    var id = element.getAttribute('field-id');
                    fielddata[id] = getItemdata(element,id);                    
                });
                var data = {
                    url: pageKey.split('?')[0], // 保存時に現在のページのURLを含む
                    fields: fielddata // 入力データを保存
                };

                // データをlocalStorageに保存
                localStorage.setItem(pageKey.split('?')[0], JSON.stringify(data));

                // classが'test'のmain要素を取得
                var mainElement = document.querySelector('.kb-injector-body');

                if (mainElement) {
                    // 'unsaved'属性を削除
                    mainElement.removeAttribute('unsaved');
                }
                alert('データが保存されました');
            } else {
                alert('保存がキャンセルされました');
            }
        });

        // クリアボタンがクリックされたときの処理を追加
        clearButton.addEventListener('click', function () {
            var confirmClear = confirm('現在のページの保存データをクリアしますか？');
            if (confirmClear) {
                localStorage.removeItem(pageKey);
                alert('保存データがクリアされました');
                window.location.reload(); // ページをリロードして入力フィールドを初期化
            } else {
                alert('クリアがキャンセルされました');
            }
        });
    
    }

    // 復号化関数
    function decrypt(encryptedText, password) {
        const parts = encryptedText.split(':'); // IVと暗号文を分割
        const iv = CryptoJS.enc.Hex.parse(parts[0]); // IVをHexからWordArrayに変換
        const ciphertext = CryptoJS.enc.Hex.parse(parts[1]); // 暗号文をHexからWordArrayに変換

        const key = CryptoJS.SHA256(password); // パスワードからキーを生成

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: ciphertext },
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        return decrypted.toString(CryptoJS.enc.Utf8); // UTF-8形式で復号化されたテキストを返す
    }
    setTimeout(function () {
        // // 付与されたパラメータを取得
        // var params = new URLSearchParams(window.location.search);
        // const paramText = params.get('data');
        // if(params.size){
        //     fetchData(paramText)
        //         .then(data => {
        //             if (data) {
        //                 const password = 'og-ogsas';
        //                 try {
        //                     const decryptedData = decrypt(data, password);
        //                     const jsonparam = JSON.parse(decryptedData);
        //                     Object.keys(jsonparam).forEach(function(key) {
        //                         if (jsonparam[key]["type"] != 'NONE'){
        //                             extractType(jsonparam,key,"");
        //                         }
        //                     });
        //                 } catch (error) {
        //                     console.error(error.message);
        //                 }
        //             } else {
        //                 console.log('No data found for the given hash.');
        //             }
        //         });
        // }
        // if(!params.size){
        //     // 前回保存されたデータをlocalStorageから読み込む
        //     var savedData = localStorage.getItem(pageKey.split('?')[0]);
        //     if (savedData) {
        //         var data = JSON.parse(savedData);
        //         Object.keys(data.fields).forEach(function(key) {
        //             setItemdata(data.fields[key],key);
        //         });
        //     }
        
        // }

        // // 保存ボタンを作成
        // var saveButton = document.createElement('button');
        // saveButton.id = 'saveButton';
        // saveButton.textContent = '保存';
        // saveButton.style.backgroundColor = 'lime'; // ボタンの色を緑に設定
        // saveButton.style.marginLeft = '10px'; // 左側にスペースを追加
        // saveButton.style.verticalAlign = 'text-bottom';

        // // クリアボタンを作成
        // var clearButton = document.createElement('button');
        // clearButton.id = 'clearButton';
        // clearButton.textContent = 'クリア';
        // clearButton.style.backgroundColor = 'red'; // ボタンの色を赤に設定
        // clearButton.style.marginLeft = '10px'; // 左側にスペースを追加
        // clearButton.style.verticalAlign = 'text-bottom';

        // var title = document.querySelectorAll('.kb-injector-header-title');
        // if (title[0]) {
        //     title[0].appendChild(saveButton);
        //     title[0].appendChild(clearButton);
        // }

        // // kb-injector-buttonクラスを持つすべての要素を取得
        // var buttons = document.querySelectorAll('.kb-injector-button');

        // // 各ボタンにクリックイベントを追加
        // buttons.forEach(function (button) {
        //     button.addEventListener('click', function () {
        //         localStorage.removeItem(pageKey);
        //     });
        // });

        // // 保存ボタンがクリックされたときの処理を追加
        // saveButton.addEventListener('click', function () {
        //     // 警告を表示してユーザーに確認
        //     var confirmSave = confirm('共有のデバイス（職場のパソコンなど）では保存したデータが第三者に見られる危険があります。それでも保存しますか？');
        //     if (confirmSave) {
        //         // IDに'input'を含むすべてのinputタグを取得
        //         // var inputFields = document.querySelectorAll('input, select, textarea');`.kb-field:not(.kb-unuse), .kb-table(.kb-unuse)`
        //         var inputFields = document.querySelectorAll('.kb-injector-body > .kb-field:not(.kb-unuse), .kb-injector-body > .kb-table:not(.kb-unuse)');
        //         var fielddata = {};
        //         // 取得した要素をログに表示
        //         inputFields.forEach(element => {
        //             var id = element.getAttribute('field-id');
        //             fielddata[id] = getItemdata(element,id);                    
        //         });
        //         var data = {
        //             url: pageKey.split('?')[0], // 保存時に現在のページのURLを含む
        //             fields: fielddata // 入力データを保存
        //         };

        //         // データをlocalStorageに保存
        //         localStorage.setItem(pageKey.split('?')[0], JSON.stringify(data));

        //         // classが'test'のmain要素を取得
        //         var mainElement = document.querySelector('.kb-injector-body');

        //         if (mainElement) {
        //             // 'unsaved'属性を削除
        //             mainElement.removeAttribute('unsaved');
        //         }
        //         alert('データが保存されました');
        //     } else {
        //         alert('保存がキャンセルされました');
        //     }
        // });

        // // クリアボタンがクリックされたときの処理を追加
        // clearButton.addEventListener('click', function () {
        //     var confirmClear = confirm('現在のページの保存データをクリアしますか？');
        //     if (confirmClear) {
        //         localStorage.removeItem(pageKey);
        //         alert('保存データがクリアされました');
        //         window.location.reload(); // ページをリロードして入力フィールドを初期化
        //     } else {
        //         alert('クリアがキャンセルされました');
        //     }
        // });
    }, 2000);
});
