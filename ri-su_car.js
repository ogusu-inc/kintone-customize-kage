window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // リース車 色ルックアップ絞り込み (Boost! Injector カスタマイズ)
    //
    //  「車種」ルックアップで選択された値と同じ車種のレコードのみを
    //  「ルックアップ_1」（色選択用ルックアップ）の候補ダイアログに表示する。
    //
    //  【方式】
    //   Boost! Injector はルックアップのサーバー側検索条件を変更するAPIを
    //   提供しないため、ルックアップ候補ダイアログ(.bst-dialog-container)が
    //   開いた際に、車種列が選択値と「完全一致」しない行を非表示にして
    //   絞り込む（クライアント側フィルタ）。
    //
    //  【汎用性】
    //   車種の値は固定リストを持たず毎回フォームから動的取得するため、
    //   車種が追加・変更されてもコード修正は不要。
    //
    //  ・初期表示時に実行
    //  ・車種変更／候補ダイアログ表示時に即時反映
    //  ・他カスタマイズと競合しないよう独立した名前空間/ガードで実装
    // ============================================================

    const LOG_PREFIX = '[リース車色絞込]';

    // 二重実行防止（同一スクリプトが複数回読み込まれた場合の競合回避）
    if (window.__riSuCarLookupLoaded) {
        console.log(`${LOG_PREFIX} 既に初期化済みのため再実行をスキップ`);
        return;
    }
    window.__riSuCarLookupLoaded = true;

    // ------------------------------------------------------------
    // フィールドコード定数
    // ------------------------------------------------------------
    const FIELDS = {
        CAR_TYPE:     '車種',          // 車種ルックアップ（絞り込みの基準値）
        COLOR_LOOKUP: 'ルックアップ_1', // 色選択用ルックアップ（絞り込み対象）
    };

    // 候補ダイアログ / ルックアップUI のセレクタ（bst- / 旧kb- 両対応）
    const SELECTORS = {
        DIALOG: '.bst-dialog-container',
        LOOKUP_BTN: '.bst-icon-lookup, .bst-search, .kb-icon-lookup, .kb-search',
    };

    // 候補ダイアログ表示中の対象判定用フラグ
    // （車種側のルックアップなど、色ルックアップ以外のダイアログは絞り込まない）
    let activeColorLookup = false;
    let dialogObserver = null;

    // ------------------------------------------------------------
    // 共通ユーティリティ
    // ------------------------------------------------------------

    /**
     * 指定フィールドのコンテナ要素を取得する
     * @param {string} fieldCode
     * @returns {Element|null}
     */
    function getFieldEl(fieldCode) {
        return document.querySelector(`.bst-field[field-id="${fieldCode}"]`)
            || document.querySelector(`[field-id="${fieldCode}"]`);
    }

    /**
     * 文字列の前後空白・連続空白を正規化する（完全一致比較のため）
     * @param {string} str
     * @returns {string}
     */
    function normalize(str) {
        return (str || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * ルックアップフィールドの現在の選択値を取得する。
     * ルックアップは選択値を input に保持しているためその値を読む。
     * @param {string} fieldCode
     * @returns {string} 取得できない場合は空文字
     */
    function getLookupValue(fieldCode) {
        try {
            const el = getFieldEl(fieldCode);
            if (!el) return '';
            const input = el.querySelector('input');
            if (input && input.value) return normalize(input.value);
            // input が無い場合は表示テキストをフォールバック取得
            const text = el.querySelector('.bst-lookup-value, .bst-text, span');
            if (text) return normalize(text.textContent);
            return '';
        } catch (e) {
            console.error(`${LOG_PREFIX} getLookupValue エラー (${fieldCode}):`, e);
            return '';
        }
    }

    /**
     * 候補ダイアログの表で「車種」列のインデックスを特定する。
     * ヘッダーに「車種」を含む列を探す。見つからなければ -1。
     * @param {Element} dialog
     * @returns {number}
     */
    function findCarTypeColumnIndex(dialog) {
        try {
            const headers = dialog.querySelectorAll('thead th');
            for (let i = 0; i < headers.length; i++) {
                if (normalize(headers[i].textContent).indexOf('車種') !== -1) {
                    return i;
                }
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} findCarTypeColumnIndex エラー:`, e);
        }
        return -1;
    }

    /**
     * 候補ダイアログの各行を、車種が完全一致するもののみ表示に絞り込む。
     * @param {Element} dialog
     * @param {string} carType  基準となる車種の値
     */
    function filterDialogRows(dialog, carType) {
        try {
            const rows = dialog.querySelectorAll('tbody tr');
            if (!rows.length) return;

            const colIdx = findCarTypeColumnIndex(dialog);
            let shown = 0;

            rows.forEach(function (row) {
                const cells = row.querySelectorAll('td');
                let match = false;

                if (colIdx >= 0 && cells[colIdx]) {
                    // 車種列のみを完全一致で比較（ワゴンR と ワゴンRスマイル を区別）
                    match = normalize(cells[colIdx].textContent) === carType;
                } else {
                    // ヘッダーから列特定できない場合は、いずれかのセルが完全一致するか
                    match = Array.prototype.some.call(cells, function (td) {
                        return normalize(td.textContent) === carType;
                    });
                }

                row.style.display = match ? '' : 'none';
                if (match) shown++;
            });

            console.log(`${LOG_PREFIX} 候補絞り込み: 車種="${carType}" 表示${shown}/${rows.length}行 (車種列index=${colIdx})`);
        } catch (e) {
            console.error(`${LOG_PREFIX} filterDialogRows エラー:`, e);
        }
    }

    /**
     * 色ルックアップ候補の絞り込みを実行する（要件の中核関数）。
     * 車種の現在値を動的取得し、開いている色ルックアップ候補ダイアログを絞り込む。
     */
    function updateColorLookupFilter() {
        try {
            const carType = getLookupValue(FIELDS.CAR_TYPE);
            const dialog = document.querySelector(SELECTORS.DIALOG);

            if (!dialog) {
                console.log(`${LOG_PREFIX} 候補ダイアログ未表示（車種="${carType}"）`);
                return;
            }
            if (!activeColorLookup) {
                // 色ルックアップ以外（車種側など）のダイアログには干渉しない
                console.log(`${LOG_PREFIX} 色ルックアップ以外のダイアログのため絞り込みをスキップ`);
                return;
            }
            if (!carType) {
                console.log(`${LOG_PREFIX} 車種が未選択のため絞り込みを行いません（全件表示）`);
                return;
            }
            filterDialogRows(dialog, carType);
        } catch (e) {
            console.error(`${LOG_PREFIX} updateColorLookupFilter エラー:`, e);
        }
    }

    /**
     * 候補ダイアログ内の変化（検索・ページング等）を監視し、都度絞り込む
     * @param {Element} dialog
     */
    function observeDialog(dialog) {
        try {
            if (dialogObserver) dialogObserver.disconnect();
            dialogObserver = new MutationObserver(function () {
                updateColorLookupFilter();
            });
            dialogObserver.observe(dialog, { childList: true, subtree: true });
            // 表示直後にも一度絞り込む
            updateColorLookupFilter();
        } catch (e) {
            console.error(`${LOG_PREFIX} observeDialog エラー:`, e);
        }
    }

    // ------------------------------------------------------------
    // イベントバインド（document レベルの委譲）
    //   ・click: どのルックアップが開かれたかを判定（色ルックアップのみ対象化）
    //   ・change: 車種の変更を検知して状態を更新
    //   document へ一度だけ委譲することで、再描画後も発火し続ける。
    // ------------------------------------------------------------

    /**
     * クリック委譲ハンドラ。
     * 色ルックアップフィールド内のクリックなら対象フラグを立て、
     * 他フィールド（車種など）内のクリックなら対象フラグを下ろす。
     * @param {Event} e
     */
    function onClick(e) {
        try {
            const target = e.target;
            if (!target || !target.closest) return;

            const field = target.closest('[field-id]');
            if (field) {
                const code = field.getAttribute('field-id');
                if (code === FIELDS.COLOR_LOOKUP) {
                    activeColorLookup = true;
                    console.log(`${LOG_PREFIX} 色ルックアップを開く操作を検知`);
                } else {
                    // 車種を含む他フィールドのルックアップを開いた場合は対象外
                    activeColorLookup = false;
                }
            }
            // フィールド外（ダイアログ内のページング等）のクリックでは状態を維持
        } catch (err) {
            console.error(`${LOG_PREFIX} onClick エラー:`, err);
        }
    }

    /**
     * change 委譲ハンドラ。車種が変わったら状態ログを出す。
     * （実際の絞り込みは色ルックアップ表示時に動的取得して行う）
     * @param {Event} e
     */
    function onChange(e) {
        try {
            const target = e.target;
            if (!target || !target.closest) return;
            const field = target.closest('[field-id]');
            if (!field) return;
            if (field.getAttribute('field-id') === FIELDS.CAR_TYPE) {
                const carType = getLookupValue(FIELDS.CAR_TYPE);
                console.log(`${LOG_PREFIX} 車種が変更されました: "${carType}"`);
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} onChange エラー:`, err);
        }
    }

    /**
     * document への委譲イベントを一度だけ登録する
     */
    function bindGlobalDelegation() {
        try {
            if (document.documentElement.dataset.riSuCarDelegated) return; // 二重バインド防止
            document.documentElement.dataset.riSuCarDelegated = 'true';

            document.addEventListener('click', onClick, true);
            document.addEventListener('change', onChange, true);
            console.log(`${LOG_PREFIX} document への click/change 委譲を登録`);
        } catch (e) {
            console.error(`${LOG_PREFIX} bindGlobalDelegation エラー:`, e);
        }
    }

    // ------------------------------------------------------------
    // 候補ダイアログ出現の監視
    // ------------------------------------------------------------
    function startDialogWatcher() {
        try {
            const observer = new MutationObserver(function (mutations) {
                for (let i = 0; i < mutations.length; i++) {
                    const added = mutations[i].addedNodes;
                    for (let j = 0; j < added.length; j++) {
                        const node = added[j];
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;

                        let dialog = null;
                        if (node.classList && node.classList.contains('bst-dialog-container')) {
                            dialog = node;
                        } else if (node.querySelector) {
                            dialog = node.querySelector(SELECTORS.DIALOG);
                        }

                        if (dialog && activeColorLookup) {
                            // 色ルックアップの候補ダイアログが開いた → 絞り込み開始
                            setTimeout(function () { observeDialog(dialog); }, 50);
                            return;
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            console.log(`${LOG_PREFIX} 候補ダイアログ監視開始`);
        } catch (e) {
            console.error(`${LOG_PREFIX} startDialogWatcher エラー:`, e);
        }
    }

    // ------------------------------------------------------------
    // 初期化
    // ------------------------------------------------------------
    function initialize() {
        try {
            console.log(`${LOG_PREFIX} 初期化開始`);

            // イベント委譲と候補ダイアログ監視を登録
            bindGlobalDelegation();
            startDialogWatcher();

            // 初期表示時点で既に色ルックアップのダイアログが開いている場合に備え一度実行
            const carType = getLookupValue(FIELDS.CAR_TYPE);
            console.log(`${LOG_PREFIX} 初期化完了（現在の車種="${carType}"）`);

            const existingDialog = document.querySelector(SELECTORS.DIALOG);
            if (existingDialog && activeColorLookup) {
                observeDialog(existingDialog);
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} initialize エラー:`, e);
        }
    }

    initialize();
});
