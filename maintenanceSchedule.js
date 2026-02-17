let records = [];
let members = [];
let tasks = [];
let schedule_readed = false;

// ステータス色取得（背景色と文字色を返す）
function getContrastColor(hex) {
    if (!hex) return '#ffffff';
    // # を除去
    const c = hex.replace('#','');
    const r = parseInt(c.substring(0,2),16);
    const g = parseInt(c.substring(2,4),16);
    const b = parseInt(c.substring(4,6),16);
    // 輝度を計算（WCAGに近い簡易法）
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
}

const colors = {
    '計画':             '#2ecc71',
    'ロス取り':         '#FF4C4C',
    '改造':             '#FF9900',
    'OCS':              '#9933CC',
    '保全カレンダー':   '#33CC33',
    '休み':             '#CCCCCC',
    '出張':             '#996633',
    '研修':             '#FFFF66',
    '打ち合わせ':       '#3399FF',
    '新規設備':         '#FF6600',
    'レイアウト':       '#CC99FF',
    'オーバーホール':    '#990000',
    'DX関連業務':       '#00CCCC',
    'その他':           '#000000',
    '自社製品組み立て':  '#66CC66',
    '自社製品設計':      '#FFCC00',
    '部品内製':          '#663300',
    '見積り':           '#00CCFF',
    '書類作成':          '#666666',
    '新商品開発':        '#FF3399',
};

function getStatusColor(status) {
    const bg = colors[status] || '#95a5a6';
    const fg = getContrastColor(bg);
    return { bg, fg };
}

// メンバー取得
function member_load() {
    fetch(`https://d37ksuq96l.execute-api.us-east-1.amazonaws.com/product/kintoneWebform/`, { method: 'GET' })
        .then(response => response.json())
        .then(data => {
            records = data.body.records;
            members = records.sort((a, b) =>
                a.ふりがな.value.localeCompare(b.ふりがな.value, 'ja')
            );
        })
        .catch(error => console.error('取得失敗:', error));
}

// スケジュール取得
function schedule_load() {
    fetch(`https://d37ksuq96l.execute-api.us-east-1.amazonaws.com/product/kintoneWebform/schedule`, { method: 'GET' })
        .then(response => response.json())
        .then(data => {
            tasks = data.body;
            schedule_readed = true;
        })
        .catch(error => console.error('取得失敗:', error));
}

function schedule_load_promise() {
    return new Promise((resolve, reject) => {
        fetch(`https://d37ksuq96l.execute-api.us-east-1.amazonaws.com/product/kintoneWebform/schedule`, { method: 'GET' })
            .then(response => response.json())
            .then(data => {
                tasks = data.body;
                schedule_readed = true;
                resolve(data);
            })
            .catch(error => {
                console.error('取得失敗:', error);
                reject(error);
            });
    });
}

member_load();
schedule_load();
// 共通：メンバー選択ダイアログ
function showMemberSelectDialogCommon(selected, onOk) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.5); z-index: 2147480000;
        display: flex; justify-content: center; align-items: center;
    `;
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 8px; padding: 20px;
        max-width: 700px; max-height: 600px; overflow-y: auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    dialog.innerHTML = `<h3 style="margin-top:0;margin-bottom:20px;color:#333;">メンバーを選択してください</h3>`;
    
    let selectedMembers = [...selected];

    // 所属部署ごとにメンバーをグループ化
    const departmentMap = {};
    members.forEach(member => {
        const dept = member['所属']?.value[0]['code'] || 'その他';
        if (!departmentMap[dept]) departmentMap[dept] = [];
        departmentMap[dept].push(member);
    });

    // 所属に基づいてタブを判定する関数
    function determineTabsForMember(affiliation) {
        const tabs = [];
        
        if (!affiliation) return tabs;
        
        const firstChar = affiliation.charAt(0);
        
        // 品質保証課
        if (affiliation.includes('品質保証')) {
            tabs.push('品質保証課');
        }
        
        // １課
        if (affiliation.includes('坪井') || firstChar === '１' || affiliation.includes('製造')) {
            tabs.push('１課');
        }
        
        // ２課
        if (firstChar === '２' || affiliation.includes('製造')) {
            tabs.push('２課');
        }
        
        // ３課
        if (firstChar === '３' || affiliation.includes('製造')) {
            tabs.push('３課');
        }
        
        // ４課
        if (firstChar === '４' || affiliation.includes('製造')) {
            tabs.push('４課');
        }
        
        // ５課
        if (firstChar === '５' || affiliation.includes('出荷検査') || affiliation.includes('製造')) {
            tabs.push('５課');
        }
        
        // ６課
        if (affiliation.includes('馬郡') || firstChar === '６' || affiliation.includes('製造')) {
            tabs.push('６課');
        }
        
        // 営業課
        if (affiliation.includes('営業') || affiliation.includes('業務')) {
            tabs.push('営業課');
        }
        
        // 生産管理
        if (affiliation.includes('生産管理') || affiliation.includes('業務')) {
            tabs.push('生産管理課');
        }
        
        // 技術
        if (affiliation.includes('技術')) {
            tabs.push('技術課');
        }
        
        // 工機
        if (affiliation.includes('技術部') || affiliation.includes('工機')) {
            tabs.push('工機課');
        }
        
        // 治工具
        if (affiliation.includes('技術部') || affiliation.includes('治工具')) {
            tabs.push('治工具課');
        }
        
        // 開発
        if (affiliation.includes('技術部') || affiliation.includes('開発')) {
            tabs.push('開発課');
        }
        
        // 改善推進課
        if (affiliation.includes('改善推進') || affiliation.includes('製造部')) {
            tabs.push('改善推進課');
        }
        
        // 熱処理課
        if (affiliation.includes('熱処理')) {
            tabs.push('熱処理課');
        }
        
        // 経理課
        if (affiliation.includes('経理課') || affiliation.includes('総務部')) {
            tabs.push('経理課');
        }
        
        // 総務課
        if (affiliation.includes('総務')) {
            tabs.push('総務課');
        }
        
        if(!tabs.length){
            tabs.push(affiliation);
        }

        return tabs;
    }

    // 各タブに所属するメンバーを振り分け
    const tabMemberMap = {};

    // 全メンバーを取得して振り分け
    Object.values(departmentMap).forEach(deptMembers => {
        deptMembers.forEach(member => {
            const affiliation = member['所属'] ? member['所属'].value[0].code : '';
            const name = member['氏名'].value;
            console.log(member);
            const assignedTabs = determineTabsForMember(affiliation);
            assignedTabs.forEach(tab => {
                if (!tabMemberMap[tab]){
                    tabMemberMap[tab] = [];
                }
                if (!tabMemberMap[tab].some(m => m['氏名'].value === name)) {
                    tabMemberMap[tab].push(member);
                }
            });
        });
    });

    // const departments = Object.keys(departmentMap).sort();

    // タブコンテナ（横長・複数段）
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = `
        display: flex; flex-wrap: wrap; border-bottom: 2px solid #3498db; margin-bottom: 15px; gap: 5px;
        max-height: 120px; /* 3段分くらい */
        overflow-y: auto;
    `;

    // タブコンテンツコンテナ
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'min-height: 300px; max-height: 350px; overflow-y: auto; margin-bottom: 20px;';

    const tabContents = {};

    // 並び順を指定
    const tabOrder = [
        '総務課', '経理課', '営業課', '生産管理課', '品質保証課',
        '技術課', '治工具課', '開発課', '工機課', '改善推進課',
        '１課', '２課', '３課', '４課', '５課', '６課', '熱処理課'
    ];

    // tabNamesを並び順でソートし、未指定タブは後ろに
    let tabNames = Object.keys(tabMemberMap);
    tabNames.sort((a, b) => {
        const idxA = tabOrder.indexOf(a);
        const idxB = tabOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b, 'ja');
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    // 初期選択タブのインデックスを取得（ログインユーザーの所属部署に基づく）
    let initialTabIndex = 0;
    // if (userDepartment) {
    //     const userTabs = determineTabsForMember(userDepartment);
    //     if (userTabs.length > 0) {
    //         const idx = tabNames.indexOf(userTabs[0]);
    //         if (idx !== -1) initialTabIndex = idx;
    //     }
    // }
    
    tabNames.forEach((tabName, index) => {
        // メンバーがいないタブはスキップ
        if (tabMemberMap[tabName].length === 0) return;

        // タブボタン
        const tab = document.createElement('button');
        tab.textContent = tabName;
        tab.type = 'button';
        tab.style.cssText = `
            flex: 1 1 10%; /* 横長・3段想定 */
            min-width: 60px;
            max-width: 11%;
            margin-bottom: 2px;
            padding: 6px 0;
            background-color: ${index === initialTabIndex ? '#3498db' : '#ecf0f1'};
            color: ${index === initialTabIndex ? 'white' : '#2c3e50'};
            border: none;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            font-size: 10px;
            font-weight: bold;
            transition: all 0.2s;
        `;

        // タブコンテンツ
        const content = document.createElement('div');
        content.style.cssText = `display: ${index === initialTabIndex ? 'block' : 'none'};`;

        // ボタンを格納するための配列
        const memberButtons = {};

        tabMemberMap[tabName].forEach(member => {
            const name = member['氏名'].value;
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.type = 'button';
            const isSelected = selectedMembers.includes(name);
            btn.style.cssText = `
                margin:5px; padding:8px 12px;
                background-color:${isSelected ? '#3498db' : '#ecf0f1'};
                color:${isSelected ? 'white' : '#2c3e50'};
                border:2px solid ${isSelected ? '#2980b9' : '#bdc3c7'};
                border-radius:4px; cursor:pointer; font-size:14px; transition:all 0.2s;
            `;
            // ボタン参照を保存
            if (!memberButtons[name]) memberButtons[name] = [];
            memberButtons[name].push(btn);

            btn.onclick = () => {
                const idx = selectedMembers.indexOf(name);
                if (idx === -1) {
                    // すべての同名ボタンを選択状態に
                    selectedMembers.push(name);
                    Object.values(tabContents).forEach(tabContent => {
                        Array.from(tabContent.querySelectorAll('button')).forEach(otherBtn => {
                            if (otherBtn.textContent === name) {
                                otherBtn.style.backgroundColor = '#3498db';
                                otherBtn.style.color = 'white';
                                otherBtn.style.borderColor = '#2980b9';
                            }
                        });
                    });
                } else {
                    // すべての同名ボタンを非選択状態に
                    selectedMembers.splice(idx, 1);
                    Object.values(tabContents).forEach(tabContent => {
                        Array.from(tabContent.querySelectorAll('button')).forEach(otherBtn => {
                            if (otherBtn.textContent === name) {
                                otherBtn.style.backgroundColor = '#ecf0f1';
                                otherBtn.style.color = '#2c3e50';
                                otherBtn.style.borderColor = '#bdc3c7';
                            }
                        });
                    });
                }
            };
            content.appendChild(btn);
        });

        tabContents[tabName] = content;
        contentContainer.appendChild(content);

        // タブクリックイベント
        tab.onclick = () => {
            // すべてのタブを非アクティブに
            Array.from(tabContainer.children).forEach(t => {
                t.style.backgroundColor = '#ecf0f1';
                t.style.color = '#2c3e50';
            });
            // クリックされたタブをアクティブに
            tab.style.backgroundColor = '#3498db';
            tab.style.color = 'white';
            
            // すべてのコンテンツを非表示に
            Object.values(tabContents).forEach(c => c.style.display = 'none');
            // クリックされたタブのコンテンツを表示
            content.style.display = 'block';
        };
        
        tabContainer.appendChild(tab);
    });
    
    dialog.appendChild(tabContainer);
    dialog.appendChild(contentContainer);

    // ボタンエリア
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = 'text-align:right;border-top:1px solid #eee;padding-top:15px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = `
        margin-right:10px; padding:8px 16px; background:#95a5a6;
        color:white; border:none; border-radius:4px; cursor:pointer;
    `;
    cancelBtn.onclick = () => document.body.removeChild(overlay);
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.type = 'button';
    okBtn.style.cssText = `
        padding:8px 16px; background:#27ae60; color:white;
        border:none; border-radius:4px; cursor:pointer;
    `;
    okBtn.onclick = () => {
        onOk(selectedMembers);
        document.body.removeChild(overlay);
    };
    buttonArea.appendChild(cancelBtn);
    buttonArea.appendChild(okBtn);
    dialog.appendChild(buttonArea);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };
}

// 共通：記入者選択ダイアログ（1人だけ選択可）
function showWriterSelectDialog(inputElem, onOk) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.5); z-index: 2147483647;
        display: flex; justify-content: center; align-items: center;
    `;
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 8px; padding: 20px;
        max-width: 500px; max-height: 600px; overflow-y: auto;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    dialog.innerHTML = `<h3 style="margin-top:0;margin-bottom:20px;color:#333;">記入者を選択してください（1人）</h3>`;
    let selectedWriter = inputElem.value || '';
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginBottom = '20px';

    members.forEach(member => {
        const name = member['氏名'].value;
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.type = 'button';
        const isSelected = selectedWriter === name;
        btn.style.cssText = `
            margin:5px; padding:8px 12px;
            background-color:${isSelected ? '#3498db' : '#ecf0f1'};
            color:${isSelected ? 'white' : '#2c3e50'};
            border:2px solid ${isSelected ? '#2980b9' : '#bdc3c7'};
            border-radius:4px; cursor:pointer; font-size:14px; transition:all 0.2s;
        `;
        btn.onclick = () => {
            Array.from(buttonContainer.children).forEach(b => {
                b.style.backgroundColor = '#ecf0f1';
                b.style.color = '#2c3e50';
                b.style.borderColor = '#bdc3c7';
            });
            selectedWriter = name;
            btn.style.backgroundColor = '#3498db';
            btn.style.color = 'white';
            btn.style.borderColor = '#2980b9';
        };
        buttonContainer.appendChild(btn);
    });
    dialog.appendChild(buttonContainer);

    // ボタンエリア
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = 'text-align:right;border-top:1px solid #eee;padding-top:15px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = `
        margin-right:10px; padding:8px 16px; background:#95a5a6;
        color:white; border:none; border-radius:4px; cursor:pointer;
    `;
    cancelBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onOk) onOk(null);
    };
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.type = 'button';
    okBtn.style.cssText = `
        padding:8px 16px; background:#27ae60; color:white;
        border:none; border-radius:4px; cursor:pointer;
    `;
    okBtn.onclick = () => {
        if (!selectedWriter) {
            alert('記入者を選択してください');
            return;
        }
        inputElem.value = selectedWriter;
        document.body.removeChild(overlay);
        if (onOk) onOk(selectedWriter);
    };
    buttonArea.appendChild(cancelBtn);
    buttonArea.appendChild(okBtn);
    dialog.appendChild(buttonArea);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.onclick = e => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            if (onOk) onOk(null);
        }
    };
}

// メンバー選択ボタン追加
function addMemberSelectButton(node) {
    // 既存のボタンを削除（重複防止）
    const existingButton = document.getElementById('member-select-button');
    if (existingButton) {
        existingButton.remove();
    }

    // ボタンを作成
    const button = document.createElement('button');
    button.id = 'member-select-button';
    button.textContent = 'メンバー選択';
    button.type = 'button';
    button.style.cssText = `
        padding: 10px 24px;
        background-color: #3498db;
        color: #fff;
        border: none;
        border-radius: 20px;
        font-size: 15px;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
        margin-bottom: 8px;
    `;

    button.onmouseenter = () => button.style.backgroundColor = '#217dbb';
    button.onmouseleave = () => button.style.backgroundColor = '#3498db';
    button.onclick = async () => {
        // --- ここから追加 ---
        // メンバーがロードされていなければローディング表示
        if (!members || members.length === 0) {
            // ローディングオーバーレイ作成
            const loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'member-loading-overlay';
            loadingOverlay.style.cssText = `
                position: fixed; top:0; left:0; width:100vw; height:100vh;
                background:rgba(0,0,0,0.5); z-index:2147483647; display:flex; justify-content:center; align-items:center;
            `;
            loadingOverlay.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                    <div style="
                        border: 6px solid #f3f3f3;
                        border-top: 6px solid #3498db;
                        border-radius: 50%;
                        width: 48px;
                        height: 48px;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    "></div>
                    <div style="color:white; font-size:18px; font-weight:bold;">メンバー読込中...<br>しばらくお待ちください</div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg);}
                        100% { transform: rotate(360deg);}
                    }
                </style>
            `;
            document.body.appendChild(loadingOverlay);

            // メンバーがロードされるまで待機
            while (!members || members.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            loadingOverlay.remove();
        }
        // --- ここまで追加 ---

        const inputElem = node.querySelector('input');
        const current = inputElem.value.split(',').map(s => s.trim()).filter(Boolean);
        showMemberSelectDialogCommon(current, selected => {
            inputElem.value = selected.join(', ');
        });
    };
    node.appendChild(button);
}

// スケジュール確認ボタン追加
function addScheduleButton() {
    if (document.getElementById('schedule-check-btn')) return;

    // 固定用ラッパーを作成
    let wrapper = document.getElementById('schedule-check-btn-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'schedule-check-btn-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            width: auto;
            display: flex;
            justify-content: flex-end;
            z-index: 2147483646; /* ベース(2147483647)より一つ下 */
            pointer-events: none; /* ボタン以外はクリックを通す */
        `;
        document.body.appendChild(wrapper);
    }

    const btn = document.createElement('button');
    btn.id = 'schedule-check-btn';
    btn.textContent = 'スケジュール確認';
    btn.style.cssText = `
        padding: 10px 24px;
        background-color: #27ae60;
        color: #fff;
        border: none;
        border-radius: 20px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
        margin-bottom: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        pointer-events: auto; /* ボタンはクリック可能 */
    `;
    btn.onclick = showScheduleDialog;

    // 既存ボタンがあれば削除
    const oldBtn = document.getElementById('schedule-check-btn');
    if (oldBtn) oldBtn.remove();

    wrapper.appendChild(btn);
}

// チャートヘッダー作成
function createChartHeader(startDate, endDate, periodType) {
    const thead = document.createElement('thead');
    const row = document.createElement('tr');
    
    // メンバー列
    const memberHeader = document.createElement('th');
    memberHeader.textContent = 'メンバー';
    memberHeader.style.cssText = `
        background: #34495e;
        color: white;
        padding: 12px;
        text-align: center;
        min-width: 100px;
        position: sticky;
        left: 0;
        z-index: 2;
    `;
    row.appendChild(memberHeader);

    // 日付列
    let colCount;
    let colWidth;
    
    switch (periodType) {
        case 'day':
            // 時間単位（24時間）
            colCount = 24;
            colWidth = '30px';
            for (let hour = 0; hour < 24; hour++) {
                const hourHeader = document.createElement('th');
                hourHeader.textContent = `${hour}:00`;
                hourHeader.style.cssText = `
                    background: #3498db;
                    color: white;
                    padding: 8px 4px;
                    text-align: center;
                    min-width: ${colWidth};
                    font-size: 11px;
                    writing-mode: vertical-rl;
                `;
                row.appendChild(hourHeader);
            }
            break;
            
        case 'week':
            // 日単位（7日）
            colCount = 7;
            colWidth = '80px';
            const currentDate = new Date(startDate);
            for (let day = 0; day < 7; day++) {
                const dayHeader = document.createElement('th');
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                dayHeader.textContent = `${currentDate.getMonth() + 1}/${currentDate.getDate()} (${dayNames[currentDate.getDay()]})`;
                dayHeader.style.cssText = `
                    background: #3498db;
                    color: white;
                    padding: 8px 4px;
                    text-align: center;
                    min-width: ${colWidth};
                    font-size: 11px;
                    writing-mode: vertical-rl;
                `;
                row.appendChild(dayHeader);
                currentDate.setDate(currentDate.getDate() + 1);
            }
            break;
            
        case 'month':
            // 日単位（月の日数）
            const daysInMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
            colWidth = '25px';
            for (let day = 1; day <= daysInMonth; day++) {
                const dayHeader = document.createElement('th');
                dayHeader.textContent = day.toString();
                dayHeader.style.cssText = `
                    background: #3498db;
                    color: white;
                    padding: 8px 2px;
                    text-align: center;
                    min-width: ${colWidth};
                    font-size: 11px;
                `;
                row.appendChild(dayHeader);
            }
            break;
    }

    thead.appendChild(row);
    return thead;
}

// タスクバー要素を作成する関数
function createTaskBarElement(taskBar, currentCol, startCol, endCol, layerIndex, maxLayers) {
    const taskElement = document.createElement('div');
    
    // 連続したタスクバーのスタイルを計算
    let leftOffset = 0;
    let rightOffset = 0;
    let borderRadius = '3px';
    
    if (currentCol === startCol && currentCol === endCol) {
        // 単一セル
        leftOffset = 2;
        rightOffset = 2;
        borderRadius = '3px';
    } else if (currentCol === startCol) {
        // 開始セル
        leftOffset = 2;
        rightOffset = 0;
        borderRadius = '3px 0 0 3px';
    } else if (currentCol === endCol) {
        // 終了セル
        leftOffset = 0;
        rightOffset = 2;
        borderRadius = '0 3px 3px 0';
    } else {
        // 中間セル
        leftOffset = 0;
        rightOffset = 0;
        borderRadius = '0';
    }
    
    // レイヤーに基づいて縦位置を計算
    const taskHeight = 18;
    const taskMargin = 2;
    const topOffset = 5 + layerIndex * (taskHeight + taskMargin);
    
    const bgColor = (taskBar.color && taskBar.color.bg) ? taskBar.color.bg : '#95a5a6';
    const fgColor = (taskBar.color && taskBar.color.fg) ? taskBar.color.fg : '#ffffff';
    
    taskElement.style.cssText = `
        position: absolute;
        top: ${topOffset}px;
        left: ${leftOffset}px;
        right: ${rightOffset}px;
        height: ${taskHeight}px;
        background: ${bgColor};
        color: ${fgColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        border-radius: ${borderRadius};
        cursor: pointer;
        z-index: 5;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    `;

    // テキストは開始セルにのみ表示
    if (currentCol === startCol) {
        taskElement.textContent = taskBar.task['タスク'];
        taskElement.title = `${taskBar.task['タスク']}\n期間: ${taskBar.task['開始日時'].toLocaleDateString()} - ${taskBar.task['終了日時'].toLocaleDateString()}`;
    }
    
    // クリックイベント
    taskElement.onclick = (e) => {
        e.stopPropagation();
        showDetailDialog(taskBar.task);
    };

    // ホバー効果
    taskElement.onmouseover = () => {
        taskElement.style.opacity = '0.8';
        taskElement.style.transform = 'scale(1.02)';
    };
    
    taskElement.onmouseout = () => {
        taskElement.style.opacity = '1';
        taskElement.style.transform = 'scale(1)';
    };

    return taskElement;
}

// タスクバーの表示位置を計算する関数
function calculateTaskBar(task, startDate, endDate, periodType, totalCols) {
    let taskStartCol = -1;
    let taskEndCol = -1;

    // タスクの開始と終了列を計算
    for (let col = 0; col < totalCols; col++) {
        let colStart, colEnd;

        switch (periodType) {
            case 'day':
                colStart = new Date(startDate);
                colStart.setHours(col, 0, 0, 0);
                colEnd = new Date(colStart);
                colEnd.setHours(col + 1, 0, 0, 0);
                break;
            case 'week':
                colStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + col);
                colStart.setHours(0, 0, 0, 0);
                colEnd = new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 1);
                colEnd.setHours(0, 0, 0, 0);
                break;
            case 'month':
                colStart = new Date(startDate.getFullYear(), startDate.getMonth(), col + 1);
                colStart.setHours(0, 0, 0, 0);
                colEnd = new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 1);
                colEnd.setHours(0, 0, 0, 0);
                break;
        }

        // タスクがこの時間帯に含まれるかチェック
        const isTaskInPeriod = task['開始日時'] < colEnd && task['終了日時'] >= colStart;
        
        if (isTaskInPeriod) {
            if (taskStartCol === -1) {
                taskStartCol = col;
            }
            taskEndCol = col;
        }
    }

    if (taskStartCol === -1) {
        return null; // タスクが表示範囲外
    }

    return {
        task: task,
        startCol: taskStartCol,
        endCol: taskEndCol,
        color: getStatusColor(task['タスク'])
    };
}

// タスクの重複を解決するためのレイヤー配置を計算する新しい関数
function calculateTaskLayers(taskBars) {
    const layers = [];
    
    // タスクを開始時間順にソート
    const sortedTasks = [...taskBars].sort((a, b) => a.startCol - b.startCol);
    
    sortedTasks.forEach(taskBar => {
        let layerIndex = 0;
        let placed = false;
        
        // 既存のレイヤーで重複しない場所を探す
        while (!placed) {
            if (!layers[layerIndex]) {
                layers[layerIndex] = [];
            }
            
            // このレイヤーで重複するタスクがあるかチェック
            const hasOverlap = layers[layerIndex].some(existingTask => 
                !(taskBar.endCol < existingTask.startCol || taskBar.startCol > existingTask.endCol)
            );
            
            if (!hasOverlap) {
                layers[layerIndex].push(taskBar);
                placed = true;
            } else {
                layerIndex++;
            }
        }
    });
    
    return layers;
}

// メンバー行作成
function createMemberRow(tasks, startDate, endDate, periodType) {
    const row = document.createElement('tr');
    row.style.cssText = 'border-bottom: 1px solid #eee;';

    // メンバー名セル
    const memberCell = document.createElement('td');
    memberCell.textContent = tasks[0]['氏名'];
    memberCell.style.cssText = `
        background: #f8f9fa;
        padding: 12px;
        font-weight: bold;
        text-align: center;
        position: sticky;
        left: 0;
        z-index: 1;
        border-right: 2px solid #ddd;
    `;
    row.appendChild(memberCell);

    let totalCols;

    switch (periodType) {
        case 'day':
            totalCols = 24;
            break;
        case 'week':
            totalCols = 7;
            break;
        case 'month':
            totalCols = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
            break;
    }

    // 各タスクの表示位置を計算
    const taskBars = [];
    tasks.forEach(task => {
        const taskBar = calculateTaskBar(task, startDate, endDate, periodType, totalCols);
        if (taskBar) {
            taskBars.push(taskBar);
        }
    });

    // タスクの重複を解決するためのレイヤー配置を計算
    const taskLayers = calculateTaskLayers(taskBars);
    const maxLayers = Math.max(1, ...taskLayers.map(layer => layer.length));

    // 各時間単位のセルを作成
    for (let col = 0; col < totalCols; col++) {
        let colStart, colEnd;

        switch (periodType) {
            case 'day':
                colStart = new Date(startDate);
                colStart.setHours(col, 0, 0, 0);
                colEnd = new Date(colStart);
                colEnd.setHours(col + 1, 0, 0, 0);
                break;
            case 'week':
                colStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + col);
                colStart.setHours(0, 0, 0, 0);
                colEnd = new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 1);
                colEnd.setHours(0, 0, 0, 0);
                break;
            case 'month':
                colStart = new Date(startDate.getFullYear(), startDate.getMonth(), col + 1);
                colStart.setHours(0, 0, 0, 0);
                colEnd = new Date(colStart.getFullYear(), colStart.getMonth(), colStart.getDate() + 1);
                colEnd.setHours(0, 0, 0, 0);
                break;
        }

        const cell = document.createElement('td');
        // セルの高さを最大レイヤー数に応じて調整
        const cellHeight = Math.max(60, maxLayers * 25 + 10);
        cell.style.cssText = `
            padding: 0;
            text-align: center;
            vertical-align: top;
            height: ${cellHeight}px;
            position: relative;
            border-right: 1px solid #eee;
            background: #fafafa;
        `;

        // この列に表示すべきタスクバーを追加（レイヤー情報も含める）
        taskLayers.forEach((layer, layerIndex) => {
            layer.forEach(taskBar => {
                if (taskBar.startCol <= col && col <= taskBar.endCol) {
                    const taskElement = createTaskBarElement(taskBar, col, taskBar.startCol, taskBar.endCol, layerIndex, maxLayers);
                    cell.appendChild(taskElement);
                }
            });
        });

        // 今日のマーカー
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (periodType === 'day') {
            const currentHour = new Date().getHours();
            if (col === currentHour && 
                today.toDateString() === startDate.toDateString()) {
                const todayMarker = document.createElement('div');
                todayMarker.style.cssText = `
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 50%;
                    width: 2px;
                    background: #e74c3c;
                    z-index: 10;
                `;
                cell.appendChild(todayMarker);
            }
        } else {
            const colDate = new Date(colStart);
            colDate.setHours(0, 0, 0, 0);
            
            if (today.getTime() === colDate.getTime()) {
                const todayMarker = document.createElement('div');
                todayMarker.style.cssText = `
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 50%;
                    width: 2px;
                    background: #e74c3c;
                    z-index: 10;
                `;
                cell.appendChild(todayMarker);
            }
        }

        row.appendChild(cell);
    }

    return row;
}

// スケジュールダイアログ
async function showScheduleDialog() {

    // 日付ナビゲーション処理
    function navigateDate(direction) {
        const periodType = document.getElementById('period-select').value;
        const currentDate = window.currentViewDate || new Date();

        switch (periodType) {
            case 'day':
                currentDate.setDate(currentDate.getDate() + direction);
                break;
            case 'week':
                currentDate.setDate(currentDate.getDate() + (direction * 7));
                break;
            case 'month':
                currentDate.setMonth(currentDate.getMonth() + direction);
                break;
        }

        window.currentViewDate = currentDate;
        renderChart();
    }

    const exist = document.getElementById('schedule-dialog-overlay');
    if (exist) exist.remove();

    // ★ スケジュール確認ボタンを非表示
    const scheduleBtn = document.getElementById('schedule-check-btn');
    if (scheduleBtn) scheduleBtn.style.display = 'none';

    // メンバー抽出
    const memberList = new Set();
    const rebuildedTasks = [];

    // ローディング
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'schedule-loading-overlay';
    loadingOverlay.style.cssText = `
        position: fixed; top:0; left:0; width:100vw; height:100vh;
        background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;
    `;
    loadingOverlay.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center;">
            <div style="
                border: 6px solid #f3f3f3;
                border-top: 6px solid #3498db;
                border-radius: 50%;
                width: 48px;
                height: 48px;
                animation: spin 1s linear infinite;
                margin-bottom: 16px;
            "></div>
            <div style="color:white; font-size:18px; font-weight:bold;">スケジュール読込中...<br>しばらくお待ちください</div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg);}
                100% { transform: rotate(360deg);}
            }
        </style>
    `;
    document.body.appendChild(loadingOverlay);

    while (!schedule_readed) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    loadingOverlay.remove();

    tasks.forEach(task => {
        const taskMembers = task['参加メンバー']?.split(',').map(m => m.trim()) || [];
        taskMembers.forEach(m => {
            if (!m) return;

            rebuildedTasks.push({
                '氏名': m,
                '開始日時': task['開始日時'] ? new Date(task['開始日時']) : null,
                '終了日時': task['終了日時'] ? new Date(task['終了日時']) : null,
                '内容': task['内容'] || '',
                '場所': task['場所'] || '',
                '備考': task['備考'] || '',
                'タスク': task['タスク'] || '',
                '記入者': task['記入者'] || '',
                'レコード番号': task['レコード番号'] || '',
                '参加メンバー': task['参加メンバー']
            });
            memberList.add(m);
        });
    });
    const memberArray = Array.from(memberList);

    // オーバーレイ
    const overlay = document.createElement('div');
    overlay.id = 'schedule-dialog-overlay';
    overlay.style.cssText = `
        position: fixed; top:0; left:0; width:100vw; height:100vh;
        background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;
    `;

    // ダイアログ
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: #fff; border-radius: 8px; padding: 24px; max-width: 900px; width: 95vw; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;

    // タイトル
    const title = document.createElement('h2');
    title.textContent = '人ごと計画表';
    title.style.cssText = 'margin:0 0 16px 0; font-size:20px; font-weight:bold; color:#333; border-bottom:2px solid #3498db; padding-bottom:10px;';
    dialog.appendChild(title);

    // コントロールパネル
    const controlPanel = document.createElement('div');
    controlPanel.style.cssText = 'display:flex; gap:15px; align-items:center; flex-wrap:wrap; margin-bottom:16px;';

    // 期間選択
    const periodLabel = document.createElement('label');
    periodLabel.textContent = '表示期間:';
    periodLabel.style.fontWeight = 'bold';

    // 期間選択
    const periodSelect = document.createElement('select');
    periodSelect.id = 'period-select';
    periodSelect.innerHTML = `
        <option value="day">今日</option>
        <option value="week" selected>今週</option>
        <option value="month">今月</option>
    `;
    periodSelect.style.cssText = 'padding:5px 10px; border-radius:4px; border:1px solid #ccc;';

    // 日付ナビゲーション
    const navContainer = document.createElement('div');
    navContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        background: white;
        padding: 5px;
        border-radius: 4px;
        border: 1px solid #ddd;
    `;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀';
    prevBtn.id = 'prev-btn';
    prevBtn.style.cssText = `
        padding: 5px 10px;
        background: #ecf0f1;
        border: 1px solid #bdc3c7;
        border-radius: 3px;
        cursor: pointer;
        font-weight: bold;
    `;
    prevBtn.onmouseover = () => prevBtn.style.background = '#d5dbdb';
    prevBtn.onmouseout = () => prevBtn.style.background = '#ecf0f1';
    prevBtn.onclick = () => navigateDate(-1);

    const currentDateDisplay = document.createElement('span');
    currentDateDisplay.id = 'current-date-display';
    currentDateDisplay.style.cssText = `
        font-weight: bold;
        min-width: 120px;
        text-align: center;
        color: #2c3e50;
    `;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '▶';
    nextBtn.id = 'next-btn';
    nextBtn.style.cssText = `
        padding: 5px 10px;
        background: #ecf0f1;
        border: 1px solid #bdc3c7;
        border-radius: 3px;
        cursor: pointer;
        font-weight: bold;
    `;
    nextBtn.onmouseover = () => nextBtn.style.background = '#d5dbdb';
    nextBtn.onmouseout = () => nextBtn.style.background = '#ecf0f1';
    nextBtn.onclick = () => navigateDate(1);

    const todayBtn = document.createElement('button');
    todayBtn.textContent = '今日';
    todayBtn.style.cssText = `
        padding: 5px 10px;
        background: #e8f5e8;
        border: 1px solid #a8d8a8;
        border-radius: 3px;
        cursor: pointer;
        font-weight: bold;
        color: #27ae60;
    `;
    todayBtn.onmouseover = () => todayBtn.style.background = '#d4edda';
    todayBtn.onmouseout = () => todayBtn.style.background = '#e8f5e8';
    todayBtn.onclick = () => {
        window.currentViewDate = new Date();
        renderChart();
    };

    navContainer.appendChild(prevBtn);
    navContainer.appendChild(currentDateDisplay);
    navContainer.appendChild(nextBtn);
    navContainer.appendChild(todayBtn);

    // メンバー選択
    const memberSelect = document.createElement('select');
    memberSelect.innerHTML = '<option value="">全員</option>' + memberArray.map(m => `<option value="${m}">${m}</option>`).join('');
    memberSelect.style.cssText = 'padding:5px 10px; border-radius:4px; border:1px solid #ccc;';

    controlPanel.appendChild(periodLabel);
    controlPanel.appendChild(periodSelect);
    controlPanel.appendChild(navContainer);
    controlPanel.appendChild(memberSelect);

    dialog.appendChild(controlPanel);

    // チャートエリア
    const chartArea = document.createElement('div');
    chartArea.id = 'schedule-chart-area';
    chartArea.style.cssText = 'overflow-x:auto; border:1px solid #ddd; background:#fafafa;';
    dialog.appendChild(chartArea);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.style.cssText = `
        margin-top:16px; padding:8px 24px; background:#95a5a6; color:#fff; border:none; border-radius:4px; cursor:pointer;
        float:right;
    `;

    closeBtn.onclick = () => {
        overlay.remove();
        // ★ スケジュール確認ボタンを再表示
        if (scheduleBtn) scheduleBtn.style.display = '';
    }

    dialog.appendChild(closeBtn);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 現在の表示日付を更新
    function updateCurrentDateDisplay() {
        const display = document.getElementById('current-date-display');
        const periodType = document.getElementById('period-select').value;
        const currentDate = window.currentViewDate || new Date();

        if (!display) return;

        let displayText = '';
        switch (periodType) {
            case 'day':
                displayText = currentDate.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    weekday: 'short'
                });
                break;
            case 'week':
                const weekStart = getWeekStart(currentDate);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                displayText = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
                break;
            case 'month':
                displayText = currentDate.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long'
                });
                break;
        }
        display.textContent = displayText;
    }

    // 週の開始日を取得（月曜日始まり）
    function getWeekStart(date) {
        const d = new Date(date); // 新しいDateオブジェクトを作成
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (diff - d.getDate()));
        weekStart.setHours(0, 0, 0, 0); // 時刻をリセット
        return weekStart;
    }

    // チャート描画
    function renderChart() {
        const periodType = periodSelect.value;
        const selectedMember = memberSelect.value;
        const currentDate = window.currentViewDate || new Date();

        updateCurrentDateDisplay();

        let filteredTasks;

        if (selectedMember){
            filteredTasks = rebuildedTasks.filter(r => (r['氏名'] === selectedMember));
        }else{
            filteredTasks = rebuildedTasks;
        }
        // 日付範囲計算
        let startDate, endDate;
        
        switch (periodType) {
            case 'day':
                startDate = new Date(currentDate);
                endDate = new Date(currentDate);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'week':
                startDate = getWeekStart(currentDate);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'month':
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
        }

        // 期間内のタスクのみフィルタリング
        const periodTasks = filteredTasks.filter(task => 
            task.開始日時 <= endDate && task.終了日時 >= startDate
        );

        if (periodTasks.length === 0) {
            chartArea.innerHTML = '<div style="padding: 40px; text-align: center; color: #666;">この期間に表示する計画がありません</div>';
            return;
        }

        chartArea.innerHTML = '';

        // チャートテーブル作成
        const table = document.createElement('table');
        table.style.cssText =`
            width:100%; 
            border-collapse:collapse; 
            font-size:14px;
        `;

        // ヘッダー作成
        const header = createChartHeader(startDate, endDate, periodType);
        table.appendChild(header);

        // 行作成
        memberArray.forEach(member => {
            const memberTasks = periodTasks.filter(task => task['氏名'] === member);
            if (memberTasks.length > 0) {
                const row = createMemberRow(memberTasks, startDate, endDate, periodType);
                table.appendChild(row);
            }
        });

        // (selectedMember ? [selectedMember] : memberArray).forEach(m => {
        //     const tr = document.createElement('tr');
        //     const td = document.createElement('td');
        //     td.textContent = m;
        //     td.style.cssText = 'background:#f8f9fa; padding:12px; font-weight:bold;';
        //     tr.appendChild(td);

        //     const cells = [];
        //     for (let c = 0; c < colCount; c++) {
        //         const cell = document.createElement('td');
        //         cell.style.cssText = 'padding:0; min-width:30px; height:30px; position:relative;';
        //         cells.push(cell);
        //         tr.appendChild(cell);
        //     }

        //     // タスクバー
        //     const bars = filteredMembers.filter(r => r['氏名'] === m).map(r => {
        //         let s = r['開始日時'];
        //         let e = r['終了日時'];
        //         let startIdx = 0, endIdx = 0;
        //         if (periodType === 'day') {
        //             startIdx = Math.max(0, s.getHours());
        //             endIdx = Math.min(23, e.getHours());
        //         } else if (periodType === 'week') {
        //             const base = new Date(start);
        //             base.setHours(0,0,0,0);
        //             startIdx = Math.max(0, Math.floor((s - base) / (1000*60*60*24)));
        //             endIdx = Math.min(6, Math.floor((e - base) / (1000*60*60*24)));
        //         } else {
        //             startIdx = Math.max(0, s.getDate() - 1);
        //             endIdx = Math.min(colCount - 1, e.getDate() - 1);
        //         }
        //         return {
        //             record: r,
        //             startIdx,
        //             endIdx,
        //             color: getStatusColor(r['タスク']),
        //         };
        //     });

        //     // レイヤー割り当て
        //     const layers = [];
        //     bars.forEach(bar => {
        //         let layer = 0;
        //         while (true) {
        //             if (!layers[layer]) layers[layer] = [];
        //             const overlap = layers[layer].some(b =>
        //                 !(bar.endIdx < b.startIdx || bar.startIdx > b.endIdx)
        //             );
        //             if (!overlap) {
        //                 layers[layer].push(bar);
        //                 bar.layer = layer;
        //                 break;
        //             }
        //             layer++;
        //         }
        //     });

        //     bars.forEach(bar => {
        //         const barDiv = document.createElement('div');
        //         barDiv.textContent = bar.record['タスク'];
        //         barDiv.style.cssText = `
        //             position:absolute;
        //             left:2px;
        //             top:${2 + bar.layer * 24}px;
        //             height:22px;
        //             background:${bar.color.bg};
        //             color:${bar.color.fg};
        //             border-radius:3px;
        //             font-size:11px;
        //             display:flex;
        //             align-items:center;
        //             justify-content:center;
        //             cursor:pointer;
        //             z-index:2;
        //             box-shadow:0 1px 3px rgba(0,0,0,0.15);
        //         `;
        //         barDiv.style.width = `calc(${bar.endIdx - bar.startIdx + 1}00% - 4px)`;
        //         barDiv.onclick = () => showDetailDialog(bar.record);
        //         cells[bar.startIdx].appendChild(barDiv);
        //     });

        //     table.appendChild(tr);
        // });

        chartArea.appendChild(table);
    }

    periodSelect.onchange = renderChart;
    memberSelect.onchange = renderChart;
    renderChart();
}

// 詳細ダイアログ
function showDetailDialog(record) {
    const exist = document.getElementById('task-detail-dialog');
    if (exist) exist.remove();

    const overlay = document.createElement('div');
    overlay.id = 'task-detail-dialog';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); z-index:10001; display:flex; justify-content:center; align-items:center;
    `;
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background:white; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:500px; width:90vw; max-height:80vh; overflow-y:auto; padding:24px;
    `;

    // タイトル
    const title = document.createElement('h3');
    title.textContent = 'タスク詳細';
    title.style.cssText = 'margin:0 0 16px 0; font-size:18px;';
    dialog.appendChild(title);

    // 詳細テーブル
    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:14px;';
    const fields = [
        { label: 'レコード番号', key: 'レコード番号' },
        { label: 'タスク名', key: 'タスク' },
        { label: '参加メンバー', key: '参加メンバー' },
        { label: '開始日時', key: '開始日時' },
        { label: '終了日時', key: '終了日時' },
        { label: '内容', key: '内容' },
        { label: '場所', key: '場所' },
        { label: '備考', key: '備考' },
        { label: '記入者', key: '記入者' }
    ];
    fields.forEach(f => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.textContent = f.label;
        td1.style.cssText = 'background:#f8f9fa; padding:12px; font-weight:bold; border:1px solid #dee2e6; width:30%;';
        const td2 = document.createElement('td');
        if ((f.key === '開始日時' || f.key === '終了日時') && record[f.key]) {
            const date = record[f.key];
            if (!isNaN(date)) {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const mi = String(date.getMinutes()).padStart(2, '0');
                td2.textContent = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            } else {
                td2.textContent = '-';
            }
        } else {
            td2.textContent = record[f.key] || '-';
        }
        td2.style.cssText = 'padding:12px; border:1px solid #dee2e6;';
        tr.appendChild(td1); tr.appendChild(td2);
        table.appendChild(tr);
    });
    dialog.appendChild(table);

    // 変更ボタン
    const editBtn = document.createElement('button');
    editBtn.textContent = '変更';
    editBtn.style.cssText = `
        margin-top:20px; padding:8px 24px; background:#e67e22; color:#fff; border:none; border-radius:4px; cursor:pointer; float:right;
    `;
    editBtn.onclick = () => showEditDialog(record, overlay);
    dialog.appendChild(editBtn);
    
    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.style.cssText = `
        margin-top:20px; margin-right:10px; padding:8px 24px; background:#e74c3c; color:#fff; border:none; border-radius:4px; cursor:pointer; float:right;
    `;
    deleteBtn.onclick = async () => {
        // 確認ダイアログ
        if (!window.confirm('本当にこのスケジュールを削除しますか？')) return;

        // ローディング表示
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'schedule-loading-overlay';
        loadingOverlay.style.cssText = `
            position: fixed; top:0; left:0; width:100vw; height:100vh;
            background:rgba(0,0,0,0.5); z-index:99999; display:flex; justify-content:center; align-items:center;
        `;
        loadingOverlay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div style="
                    border: 6px solid #f3f3f3;
                    border-top: 6px solid #e74c3c;
                    border-radius: 50%;
                    width: 48px;
                    height: 48px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                "></div>
                <div style="color:white; font-size:18px; font-weight:bold;">削除中...<br>しばらくお待ちください</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg);}
                    100% { transform: rotate(360deg);}
                }
            </style>
        `;
        document.body.appendChild(loadingOverlay);

        try {
            await fetch('https://d37ksuq96l.execute-api.us-east-1.amazonaws.com/product/kintoneWebform/schedule', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'レコード番号': record['レコード番号'] })
            });

            overlay.remove();
            loadingOverlay.querySelector('div:last-child').innerHTML = 'スケジュール更新中...<br>しばらくお待ちください';

            schedule_readed = false;
            await schedule_load_promise();

            loadingOverlay.remove();

            alert('削除しました');
            showScheduleDialog();

        } catch (e) {
            console.error('Error:', e);
            alert('削除に失敗しました');
            loadingOverlay.remove();
        }
    };
    dialog.appendChild(deleteBtn);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    closeBtn.style.cssText = `
        margin-top:20px; margin-right:10px; padding:8px 24px; background:#95a5a6; color:#fff; border:none; border-radius:4px; cursor:pointer; float:right;
    `;
    closeBtn.onclick = () => overlay.remove();
    dialog.appendChild(closeBtn);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

// 編集ダイアログ
function showEditDialog(record, parentOverlay) {
    const exist = document.getElementById('task-edit-dialog');
    if (exist) exist.remove();

    const overlay = document.createElement('div');
    overlay.id = 'task-edit-dialog';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); z-index:10002; display:flex; justify-content:center; align-items:center;
    `;
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background:white; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:500px; width:90vw; max-height:80vh; overflow-y:auto; padding:24px;
    `;

    // タイトル
    const title = document.createElement('h3');
    title.textContent = '予定編集';
    title.style.cssText = 'margin:0 0 16px 0; font-size:18px;';
    dialog.appendChild(title);

    // 編集フォーム
    const form = document.createElement('form');

    // 分類（タスク）ドロップダウン
    const divTask = document.createElement('div');
    divTask.style.marginBottom = '12px';
    const labelTask = document.createElement('label');
    labelTask.textContent = '分類';
    labelTask.style.display = 'block';
    labelTask.style.marginBottom = '4px';
    const selectTask = document.createElement('select');
    selectTask.name = 'タスク';
    selectTask.style.cssText = 'width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;';
    Object.keys(colors).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        if (record['タスク'] === key || record['タスク']?.value === key) opt.selected = true;
        selectTask.appendChild(opt);
    });
    divTask.appendChild(labelTask);
    divTask.appendChild(selectTask);
    form.appendChild(divTask);

    // 参加メンバー（readonly）＋ボタン
    const divMember = document.createElement('div');
    divMember.style.marginBottom = '12px';
    const labelMember = document.createElement('label');
    labelMember.textContent = '参加メンバー';
    labelMember.style.display = 'block';
    labelMember.style.marginBottom = '4px';
    const inputMember = document.createElement('input');
    inputMember.name = '参加メンバー';
    inputMember.value = record['参加メンバー'] || '';
    inputMember.readOnly = true;
    inputMember.style.cssText = 'width:calc(100% - 120px); padding:6px; border-radius:4px; border:1px solid #ccc; margin-right:8px;';
    divMember.appendChild(labelMember);
    divMember.appendChild(inputMember);

    // メンバー選択ボタン
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = 'メンバー選択';
    selectBtn.style.cssText = `
        padding: 8px 16px;
        background-color: #3498db;
        color: #fff;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        margin-left: 4px;
    `;
    selectBtn.onclick = function() {
        showMemberSelectDialogCommon(
            inputMember.value.split(',').map(s => s.trim()).filter(Boolean),
            function(selected) { inputMember.value = selected.join(', '); }
        );
    };
    divMember.appendChild(selectBtn);
    form.appendChild(divMember);

    // その他フィールド
    const fields = [
        { label: '開始日時', key: '開始日時', type: 'datetime-local' },
        { label: '終了日時', key: '終了日時', type: 'datetime-local' },
        { label: '内容', key: '内容', type: 'textarea' },
        { label: '場所', key: '場所', type: 'text' },
        { label: '備考', key: '備考', type: 'textarea' }
    ];
    fields.forEach(f => {
        const div = document.createElement('div');
        div.style.marginBottom = '12px';
        const label = document.createElement('label');
        label.textContent = f.label;
        label.style.display = 'block';
        label.style.marginBottom = '4px';
        let input;
        if (f.type === 'textarea') {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = f.type;
        }
        input.name = f.key;
        if ((f.key === '開始日時' || f.key === '終了日時') && record[f.key]) {
            const date = record[f.key];
            if (!isNaN(date)) {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const mi = String(date.getMinutes()).padStart(2, '0');
                input.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
            } else {
                input.value = '';
            }
        } else {
            input.value = record[f.key] || '';
        }
        input.style.cssText = 'width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;';
        div.appendChild(label); div.appendChild(input);
        form.appendChild(div);
    });

    // 保存ボタン
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.type = 'button';
    saveBtn.style.cssText = 'padding:8px 24px; background:#27ae60; color:#fff; border:none; border-radius:4px; cursor:pointer;';
    saveBtn.onclick = async () => {
        showWriterSelectDialog({ value: '' }, async function(writerName) {
            if (writerName) {
                const loadingOverlay = document.createElement('div');
                loadingOverlay.id = 'schedule-loading-overlay';
                loadingOverlay.style.cssText = `
                    position: fixed; top:0; left:0; width:100vw; height:100vh;
                    background:rgba(0,0,0,0.5); z-index:99999; display:flex; justify-content:center; align-items:center;
                `;
                loadingOverlay.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center;">
                        <div style="
                            border: 6px solid #f3f3f3;
                            border-top: 6px solid #3498db;
                            border-radius: 50%;
                            width: 48px;
                            height: 48px;
                            animation: spin 1s linear infinite;
                            margin-bottom: 16px;
                        "></div>
                        <div style="color:white; font-size:18px; font-weight:bold;">保存中...<br>しばらくお待ちください</div>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg);}
                            100% { transform: rotate(360deg);}
                        }
                    </style>
                `;
                document.body.appendChild(loadingOverlay);

                try {
                    const newRecord = { ...record };
                    newRecord['タスク'] = form['タスク'].value;
                    newRecord['参加メンバー'] = form['参加メンバー'].value;
                    ['開始日時','終了日時','内容','場所','備考'].forEach(key => {
                        if (form[key]) newRecord[key] = form[key].value;
                    });
                    newRecord['記入者'] = writerName;

                    await fetch('https://d37ksuq96l.execute-api.us-east-1.amazonaws.com/product/kintoneWebform/schedule', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ record: newRecord })
                    });

                    overlay.remove();
                    parentOverlay.remove();

                    loadingOverlay.querySelector('div:last-child').innerHTML = 'スケジュール更新中...<br>しばらくお待ちください';

                    schedule_readed = false;
                    await schedule_load_promise();

                    loadingOverlay.remove();

                    alert('変更しました');
                    showScheduleDialog();

                } catch (e) {
                    console.error('Error:', e);
                    alert('変更に失敗しました');
                    loadingOverlay.remove();
                }
            }
        });
    };
    form.appendChild(saveBtn);

    // キャンセル
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = 'margin-left:10px; padding:8px 24px; background:#95a5a6; color:#fff; border:none; border-radius:4px; cursor:pointer;';
    cancelBtn.onclick = () => overlay.remove();
    form.appendChild(cancelBtn);

    dialog.appendChild(form);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

// DOM監視
window.addEventListener('load', function () {
    const parentNode = document.body;
    const config = { childList: true, subtree: true };
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach(mutation => {
            mutation.addedNodes.forEach(elem => {
                if (elem.nodeType === Node.ELEMENT_NODE && elem.querySelector('[field-id="参加メンバー"]')) {
                    var node = elem.querySelector('[field-id="参加メンバー"]');
                    node.querySelector('input').disabled = true;
                    addMemberSelectButton(node);
                    addScheduleButton();
                }
            });
        });
    });
    observer.observe(parentNode, config);
});
