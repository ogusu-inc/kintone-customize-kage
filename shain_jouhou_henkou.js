window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 申請区分 フィールド表示制御
    // 申請区分ドロップダウンの値に応じて関連フィールドを表示/非表示
    // ============================================================

    const FIELD_SHINSEI = '申請区分';
    const FIELD_JUSHO   = '住所変更の場合';
    const FIELD_GINKO   = '銀行名';

    // 申請区分値 → フィールド表示ルール（true: 表示 / false: 非表示）
    const VISIBILITY_RULES = {
        '住所変更':     { [FIELD_JUSHO]: true,  [FIELD_GINKO]: false },
        '扶養変更':     { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
        '給与口座届出': { [FIELD_JUSHO]: false, [FIELD_GINKO]: true  },
        'その他':       { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
    };

    /**
     * 指定フィールドの表示・非表示を切り替える
     * @param {string} fieldId - フィールドコード
     * @param {boolean} visible - true: 表示 / false: 非表示
     */
    function setFieldVisible(fieldId, visible) {
        try {
            const el = document.querySelector(`.bst-field[field-id="${fieldId}"]`);
            if (!el) {
                console.warn(`[申請区分制御] フィールドが見つかりません: ${fieldId}`);
                return;
            }
            el.style.display = visible ? '' : 'none';
            console.log(`[申請区分制御] ${fieldId}: ${visible ? '表示' : '非表示'}`);
        } catch (e) {
            console.error(`[申請区分制御] setFieldVisible エラー (${fieldId}):`, e);
        }
    }

    /**
     * 申請区分の値に対応するルールを適用する
     * @param {string} value - 申請区分の選択値
     */
    function applyVisibility(value) {
        try {
            console.log(`[申請区分制御] 申請区分 = "${value}"`);
            const rule = VISIBILITY_RULES[value];
            if (!rule) {
                // 未定義の値はすべて非表示（初期値空文字など）
                console.log('[申請区分制御] ルール未定義のため制御対象フィールドをすべて非表示');
                setFieldVisible(FIELD_JUSHO, false);
                setFieldVisible(FIELD_GINKO, false);
                return;
            }
            Object.entries(rule).forEach(function (entry) {
                setFieldVisible(entry[0], entry[1]);
            });
        } catch (e) {
            console.error('[申請区分制御] applyVisibility エラー:', e);
        }
    }

    /**
     * 申請区分 select へのイベントバインドと初期表示制御
     * dataset フラグで二重バインドを防止する
     */
    function bindDropdown() {
        try {
            var select = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);
            if (!select) {
                console.warn('[申請区分制御] 申請区分 select が見つかりません');
                return;
            }
            if (select.dataset.shinseiVisibilityBound) return; // 二重バインド防止
            select.dataset.shinseiVisibilityBound = 'true';

            // 初期表示時の制御
            applyVisibility(select.value);

            // 変更時の即時反映
            select.addEventListener('change', function () {
                applyVisibility(this.value);
            });

            console.log('[申請区分制御] ドロップダウンへのバインド完了');
        } catch (e) {
            console.error('[申請区分制御] bindDropdown エラー:', e);
        }
    }

    // MutationObserver でBoost! Injector フォームの描画完了を検知
    var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var addedNodes = mutations[i].addedNodes;
            for (var j = 0; j < addedNodes.length; j++) {
                var node = addedNodes[j];
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                // 追加された要素の中に申請区分フィールドが含まれる場合
                var hasField = node.querySelector && node.querySelector(`[field-id="${FIELD_SHINSEI}"]`);
                // 追加された要素自身が申請区分フィールドの場合
                var isField = node.getAttribute && node.getAttribute('field-id') === FIELD_SHINSEI;

                if (hasField || isField) {
                    bindDropdown();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ページロード時点で既に描画済みの場合は即時バインド
    var alreadyRendered = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);
    if (alreadyRendered) {
        bindDropdown();
    }

    console.log('[申請区分制御] MutationObserver 監視開始');
});
