window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 申請区分 フィールド表示制御
    // 申請区分ドロップダウンの値に応じて関連フィールドを表示/非表示
    // ============================================================

    const FIELD_SHINSEI = '申請区分';
    const FIELD_JUSHO   = '住所変更の場合';
    const FIELD_GINKO   = '銀行名';

    // 追加要件用フィールドコード
    const FIELD_2FURIKOMI = '_2箇所振込';     // チェックボックス
    const FIELD_GINKO2    = '第2口座銀行名';
    const FIELD_KINGAKU   = '金額';

    // _2箇所振込 を表示する申請区分
    const SHINSEI_KYUYO   = '給与口座届出';
    // _2箇所振込 の「希望する」選択肢ラベル
    const OPTION_KIBOU    = '希望する';

    // 申請区分値 → フィールド表示ルール（true: 表示 / false: 非表示）
    const VISIBILITY_RULES = {
        '住所変更':     { [FIELD_JUSHO]: true,  [FIELD_GINKO]: false },
        '扶養変更':     { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
        '給与口座届出': { [FIELD_JUSHO]: false, [FIELD_GINKO]: true  },
        'その他':       { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
    };

    /**
     * フィールド要素（.bst-field[field-id]）を取得する
     * @param {string} fieldId - フィールドコード
     * @returns {Element|null}
     */
    function getFieldEl(fieldId) {
        return document.querySelector(`.bst-field[field-id="${fieldId}"]`)
            || document.querySelector(`[field-id="${fieldId}"]`);
    }

    /**
     * 表示・非表示の実体となる要素を特定する。
     * Boost! Injector は .bst-field 内側ではなく、そのフィールド専用の
     * 親（祖先）コンテナの display を切り替えている場合がある。
     * そこで「そのフィールド 1 つだけを内包する最上位の祖先」を辿り、
     * それを制御対象とする（兄弟フィールドを巻き込まない）。
     * @param {Element} fieldEl
     * @returns {Element} 制御対象要素
     */
    function getFieldControlElement(fieldEl) {
        var control = fieldEl;
        var p = fieldEl.parentElement;
        while (p && p !== document.body) {
            var owned = p.querySelectorAll('[field-id]');
            // この祖先が「自フィールドだけ」を含む間は登り続ける
            if (owned.length === 1 && owned[0] === fieldEl) {
                control = p;
                p = p.parentElement;
            } else {
                break; // 他フィールドを含む祖先に達したら停止
            }
        }
        return control;
    }

    /**
     * フィールドが実際に画面表示されているか判定する。
     * offsetParent は要素自身/祖先のいずれかが display:none のとき null になるため、
     * 祖先側で非表示にされているケースも検知できる。
     * @param {string} fieldId
     * @returns {boolean}
     */
    function isFieldVisible(fieldId) {
        var el = getFieldEl(fieldId);
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        // position:fixed 等で offsetParent が null になる場合の保険
        return window.getComputedStyle(el).display !== 'none';
    }

    /**
     * 指定フィールドの表示・非表示を切り替える（全フィールド共通）。
     * 制御対象は getFieldControlElement() で特定した実体要素。
     * @param {string} fieldId - フィールドコード
     * @param {boolean} visible - true: 表示 / false: 非表示
     */
    function setFieldVisible(fieldId, visible) {
        try {
            const el = getFieldEl(fieldId);
            if (!el) {
                console.warn(`[申請区分制御] フィールドが見つかりません: ${fieldId}`);
                return;
            }
            const control = getFieldControlElement(el);

            // --- 原因調査用 診断ログ ---
            var ancestorClasses = [];
            var a = el;
            for (var n = 0; a && a !== document.body && n < 8; n++) {
                ancestorClasses.push(a.className || ('<' + a.tagName.toLowerCase() + '>'));
                a = a.parentElement;
            }
            console.log('[申請区分制御] setFieldVisible 診断:', {
                fieldId: fieldId,
                element: el,
                parentElement: el.parentElement,
                'parentElement.style.display': el.parentElement ? el.parentElement.style.display : '(なし)',
                ancestorClasses: ancestorClasses,
                controlElement: control,
                controlIsSelf: control === el,
            });

            if (visible) {
                // 内側・制御対象の双方から非表示指定（!important 含む）を確実に解除
                control.style.removeProperty('display');
                if (control.hasAttribute('hidden')) control.removeAttribute('hidden');
                el.style.removeProperty('display');
                if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
            } else {
                control.style.setProperty('display', 'none', 'important');
            }

            console.log(`[申請区分制御] ${fieldId}: ${visible ? '表示' : '非表示'} (制御要素: ${control.className || control.tagName})`);
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

            // --- 既存制御：住所変更の場合 / 銀行名（変更しない） ---
            const rule = VISIBILITY_RULES[value];
            if (!rule) {
                // 未定義の値はすべて非表示（初期値空文字など）
                console.log('[申請区分制御] ルール未定義のため制御対象フィールドをすべて非表示');
                setFieldVisible(FIELD_JUSHO, false);
                setFieldVisible(FIELD_GINKO, false);
            } else {
                Object.entries(rule).forEach(function (entry) {
                    setFieldVisible(entry[0], entry[1]);
                });
            }

            // --- 追加要件①：_2箇所振込 は「給与口座届出」のときのみ表示 ---
            setFieldVisible(FIELD_2FURIKOMI, value === SHINSEI_KYUYO);

            // --- 追加要件②：第2口座銀行名 / 金額 を _2箇所振込 の状態に応じて反映 ---
            updateSecondAccountVisibility();
        } catch (e) {
            console.error('[申請区分制御] applyVisibility エラー:', e);
        }
    }

    /**
     * _2箇所振込 の「希望する」がチェックされているか判定する
     * @returns {boolean} 希望する にチェックがあれば true
     */
    function isSecondAccountWanted() {
        try {
            var field = document.querySelector(`.bst-field[field-id="${FIELD_2FURIKOMI}"]`);
            if (!field) return false;
            var boxes = field.querySelectorAll('input[type="checkbox"]');
            for (var i = 0; i < boxes.length; i++) {
                var box = boxes[i];
                // value属性 と 内包ラベルテキストの両方で「希望する」を照合
                var text = box.value || '';
                var label = box.closest('label');
                if (label) text += ' ' + label.textContent;
                if (text.indexOf(OPTION_KIBOU) !== -1 && box.checked) {
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error('[申請区分制御] isSecondAccountWanted エラー:', e);
            return false;
        }
    }

    /**
     * 第2口座銀行名 / 金額 の表示・非表示を更新する。
     * 毎回いったん表示状態へ戻してから、条件に応じて非表示にする
     * （「非表示になるが再表示されない」不具合を防止）。
     */
    function updateSecondAccountVisibility() {
        try {
            // _2箇所振込 自体が非表示なら配下フィールドも表示しない
            // （祖先側で非表示にされるケースも検知するため isFieldVisible を使用）
            var secondVisible = isFieldVisible(FIELD_2FURIKOMI);

            // まず必ず表示状態へ戻す
            setFieldVisible(FIELD_GINKO2, true);
            setFieldVisible(FIELD_KINGAKU, true);

            // 条件を満たさない場合のみ非表示にする
            if (!secondVisible || !isSecondAccountWanted()) {
                setFieldVisible(FIELD_GINKO2, false);
                setFieldVisible(FIELD_KINGAKU, false);
            }
        } catch (e) {
            console.error('[申請区分制御] updateSecondAccountVisibility エラー:', e);
        }
    }

    /**
     * 申請区分 select へのイベントバインドと初期表示制御
     * dataset フラグで二重バインドを防止する
     */
    function bindDropdown() {
        try {
            var select = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);

            // --- 申請区分 select のバインド（二重バインド防止） ---
            if (select && !select.dataset.shinseiVisibilityBound) {
                select.dataset.shinseiVisibilityBound = 'true';

                // 初期表示時の制御
                applyVisibility(select.value);

                // 変更時の即時反映
                select.addEventListener('change', function () {
                    applyVisibility(this.value);
                });

                console.log('[申請区分制御] ドロップダウンへのバインド完了');
            } else if (!select) {
                console.warn('[申請区分制御] 申請区分 select が見つかりません');
            }

            // --- 追加要件②：_2箇所振込 チェックボックスのバインド ---
            // select の early-return に依存させず独立して実行する
            var secondField = document.querySelector(`.bst-field[field-id="${FIELD_2FURIKOMI}"]`);
            if (secondField && !secondField.dataset.secondAccountBound) {
                secondField.dataset.secondAccountBound = 'true';

                var boxes = secondField.querySelectorAll('input[type="checkbox"]');
                for (var i = 0; i < boxes.length; i++) {
                    // 変更時の即時反映
                    boxes[i].addEventListener('change', function () {
                        updateSecondAccountVisibility();
                    });
                }

                // チェックボックスが select より後に描画された場合に備え、
                // 現在の申請区分値で初期表示を再適用する
                if (select) {
                    applyVisibility(select.value);
                } else {
                    updateSecondAccountVisibility();
                }

                console.log('[申請区分制御] _2箇所振込 チェックボックスへのバインド完了');
            }
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

                // 追加された要素の中に申請区分 / _2箇所振込 フィールドが含まれる場合
                var hasField = node.querySelector && (
                    node.querySelector(`[field-id="${FIELD_SHINSEI}"]`) ||
                    node.querySelector(`[field-id="${FIELD_2FURIKOMI}"]`)
                );
                // 追加された要素自身が申請区分 / _2箇所振込 フィールドの場合
                var nodeFieldId = node.getAttribute && node.getAttribute('field-id');
                var isField = nodeFieldId === FIELD_SHINSEI || nodeFieldId === FIELD_2FURIKOMI;

                if (hasField || isField) {
                    bindDropdown();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ページロード時点で既に描画済みの場合は即時バインド
    var alreadyRendered = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`)
        || document.querySelector(`.bst-field[field-id="${FIELD_2FURIKOMI}"]`);
    if (alreadyRendered) {
        bindDropdown();
    }

    console.log('[申請区分制御] MutationObserver 監視開始');
});
