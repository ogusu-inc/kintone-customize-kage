window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 申請区分 フィールド表示制御
    //   申請区分ドロップダウンの値に応じて関連フィールドを表示/非表示する。
    //   表示制御は Boost! Injector の bst-unuse クラスで行う。
    // ============================================================

    const FIELD_SHINSEI = '申請区分';
    const FIELD_JUSHO   = '住所変更の場合';
    const FIELD_GINKO   = '銀行名';

    const FIELD_KOUZA_SHURUI = '口座種類';     // 申請区分=給与口座届出 のときのみ表示
    const FIELD_KOUZA_BANGOU = '口座番号';     // 申請区分=給与口座届出 のときのみ表示

    const FIELD_2FURIKOMI = '_2箇所振込';     // チェックボックス
    const FIELD_GINKO2    = '第2口座銀行名';
    const FIELD_KINGAKU   = '金額';

    const FIELD_KOUZA_SHURUI2 = '口座種類2';   // _2箇所振込=希望する のときのみ表示
    const FIELD_KOUZA_BANGOU2 = '口座番号2';   // _2箇所振込=希望する のときのみ表示

    const SHINSEI_KYUYO = '給与口座届出';      // _2箇所振込 を表示する申請区分
    const OPTION_KIBOU  = '希望する';          // _2箇所振込 の選択肢

    // 申請区分値 → フィールド表示ルール（true: 表示 / false: 非表示）
    const VISIBILITY_RULES = {
        '住所変更':     { [FIELD_JUSHO]: true,  [FIELD_GINKO]: false },
        '扶養変更':     { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
        '給与口座届出': { [FIELD_JUSHO]: false, [FIELD_GINKO]: true  },
        'その他':       { [FIELD_JUSHO]: false, [FIELD_GINKO]: false },
    };

    /** フィールド要素（.bst-field[field-id]）を取得する */
    function getFieldEl(fieldId) {
        return document.querySelector(`.bst-field[field-id="${fieldId}"]`);
    }

    /** フィールドが表示中か（bst-unuse が付いていなければ表示） */
    function isFieldVisible(fieldId) {
        const el = getFieldEl(fieldId);
        return !!el && !el.classList.contains('bst-unuse');
    }

    /** 指定フィールドの表示・非表示を切り替える（bst-unuse クラスで制御） */
    function setFieldVisible(fieldId, visible) {
        const el = getFieldEl(fieldId);
        if (!el) {
            console.warn(`[申請区分制御] フィールドが見つかりません: ${fieldId}`);
            return;
        }
        el.classList.toggle('bst-unuse', !visible);
    }

    /** _2箇所振込 の「希望する」がチェックされているか判定する */
    function isSecondAccountWanted() {
        const field = getFieldEl(FIELD_2FURIKOMI);
        if (!field) return false;
        const boxes = field.querySelectorAll('input[type="checkbox"]');
        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];
            // value属性 と 内包ラベルテキストの両方で「希望する」を照合
            let text = box.value || '';
            const label = box.closest('label');
            if (label) text += ' ' + label.textContent;
            if (text.indexOf(OPTION_KIBOU) !== -1 && box.checked) return true;
        }
        return false;
    }

    /**
     * 第2口座銀行名 / 金額 / 口座種類2 / 口座番号2 の表示を更新する。
     * 毎回いったん表示へ戻してから条件に応じて非表示にする
     * （「非表示になるが再表示されない」不具合を防止）。
     * _2箇所振込 が非表示、または「希望する」未チェックなら非表示。
     */
    function updateSecondAccountVisibility() {
        const show = isFieldVisible(FIELD_2FURIKOMI) && isSecondAccountWanted();
        setFieldVisible(FIELD_GINKO2, show);            // 既存制御（変更なし）
        setFieldVisible(FIELD_KINGAKU, show);           // 既存制御（変更なし）
        setFieldVisible(FIELD_KOUZA_SHURUI2, show);     // ②追加：口座種類2
        setFieldVisible(FIELD_KOUZA_BANGOU2, show);     // ②追加：口座番号2
    }

    /** 申請区分の値に対応する表示ルールを適用する */
    function applyVisibility(value) {
        // 住所変更の場合 / 銀行名（既存ルール）。未定義値はすべて非表示。
        const rule = VISIBILITY_RULES[value] || { [FIELD_JUSHO]: false, [FIELD_GINKO]: false };
        Object.keys(rule).forEach(function (fieldId) {
            setFieldVisible(fieldId, rule[fieldId]);
        });

        // ①口座種類 / 口座番号 は「給与口座届出」のときのみ表示（銀行名と同条件）
        const isKyuyo = value === SHINSEI_KYUYO;
        setFieldVisible(FIELD_KOUZA_SHURUI, isKyuyo);
        setFieldVisible(FIELD_KOUZA_BANGOU, isKyuyo);

        // _2箇所振込 は「給与口座届出」のときのみ表示
        setFieldVisible(FIELD_2FURIKOMI, isKyuyo);

        // ②第2口座銀行名 / 金額 / 口座種類2 / 口座番号2 を _2箇所振込 の状態に応じて反映
        updateSecondAccountVisibility();
    }

    /** 申請区分 select と _2箇所振込 チェックボックスへのイベントバインド */
    function bindDropdown() {
        const select = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);

        // 申請区分 select（二重バインド防止）
        if (select && !select.dataset.shinseiVisibilityBound) {
            select.dataset.shinseiVisibilityBound = 'true';
            applyVisibility(select.value); // 初期表示
            select.addEventListener('change', function () {
                applyVisibility(this.value); // 変更時に即時反映
            });
        }

        // _2箇所振込 チェックボックス（select の状態に依存せず独立してバインド）
        const secondField = getFieldEl(FIELD_2FURIKOMI);
        if (secondField && !secondField.dataset.secondAccountBound) {
            secondField.dataset.secondAccountBound = 'true';
            secondField.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
                box.addEventListener('change', updateSecondAccountVisibility);
            });
            // チェックボックスが後から描画された場合に備え現在値で再適用
            if (select) applyVisibility(select.value);
            else updateSecondAccountVisibility();
        }
    }

    // Boost! Injector フォームの描画完了を MutationObserver で検知
    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const fieldId = node.getAttribute && node.getAttribute('field-id');
                const hasField = node.querySelector && (
                    node.querySelector(`[field-id="${FIELD_SHINSEI}"]`) ||
                    node.querySelector(`[field-id="${FIELD_2FURIKOMI}"]`)
                );
                if (hasField || fieldId === FIELD_SHINSEI || fieldId === FIELD_2FURIKOMI) {
                    bindDropdown();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ページロード時点で既に描画済みなら即時バインド
    if (document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`)
        || getFieldEl(FIELD_2FURIKOMI)) {
        bindDropdown();
    }
});
