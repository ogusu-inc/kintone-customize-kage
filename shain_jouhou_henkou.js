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
    const FIELD_SHITEN_MEI   = '支店名';       // 申請区分=給与口座届出 のときのみ表示（口座種類と同条件）
    const FIELD_SHITEN_BANGOU = '支店番号';    // 申請区分=給与口座届出 のときのみ表示（口座種類と同条件）

    const FIELD_2FURIKOMI = '_2箇所振込';     // チェックボックス
    const FIELD_GINKO2    = '第2口座銀行名';
    const FIELD_KYUYO_KINGAKU = '給与金額';    // _2箇所振込=希望する のときのみ表示
    const FIELD_SHOYO_KINGAKU = '賞与金額';    // _2箇所振込=希望する のときのみ表示（給与金額と同条件）

    const FIELD_KOUZA_SHURUI2 = '口座種類2';   // _2箇所振込=希望する のときのみ表示
    const FIELD_KOUZA_BANGOU2 = '口座番号2';   // _2箇所振込=希望する のときのみ表示
    const FIELD_SHITEN_MEI2   = '支店名2';     // _2箇所振込=希望する のときのみ表示（口座種類2と同条件）
    const FIELD_SHITEN_BANGOU2 = '支店番号2';  // _2箇所振込=希望する のときのみ表示（口座種類2と同条件）

    const SHINSEI_KYUYO = '給与口座届出';      // _2箇所振込 を表示する申請区分
    const OPTION_KIBOU  = '希望する';          // _2箇所振込 の選択肢
    const OPTION_FUTSUU = '普通';              // 口座種類 / 口座種類2 の初期値

    // 「口座種類」と同一の表示条件（申請区分=給与口座届出）で制御するフィールド群
    const FIELDS_KYUYO_KOUZA = [
        FIELD_KOUZA_SHURUI,
        FIELD_KOUZA_BANGOU,
        FIELD_SHITEN_MEI,
        FIELD_SHITEN_BANGOU,
    ];

    // 「口座種類2」と同一の表示条件（申請区分=給与口座届出 かつ _2箇所振込=希望する）で制御するフィールド群
    const FIELDS_SECOND_ACCOUNT = [
        FIELD_GINKO2,
        FIELD_KOUZA_SHURUI2,
        FIELD_KOUZA_BANGOU2,
        FIELD_SHITEN_MEI2,
        FIELD_SHITEN_BANGOU2,
        FIELD_KYUYO_KINGAKU,
        FIELD_SHOYO_KINGAKU,
    ];

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

    /** 申請区分 select の現在値を取得する（表示状態は一切参照しない） */
    function getCurrentShinseiValue() {
        const select = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);
        return select ? select.value : '';
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
     * 口座種類ドロップダウンに初期値「普通」を設定する（要件③）。
     *  - フィールドごとに一度だけ実行（dataset フラグで保証）。
     *  - 現在値が未設定（空）の場合のみ設定。既存値があれば上書きしない。
     *  - 成功（または既存値の確定）まではフラグを立てず、select / option が
     *    未描画ならリトライする。これにより「空欄のまま」を防止する。
     *  - 一度フラグが立つと再実行しないため、表示・非表示の切り替えや
     *    ユーザーの手動変更後に「普通」へ戻ることはない。
     * @param {string} fieldId 対象フィールド
     * @param {number} [attempt] 内部リトライ回数（外部からは指定不要）
     */
    function applyDefaultKouzaShurui(fieldId, attempt) {
        attempt = attempt || 0;

        const field = getFieldEl(fieldId);
        const select = field && field.querySelector('select');

        // select が未描画なら少し待って再試行（フラグは立てない）
        if (!select) {
            if (attempt < 10) {
                setTimeout(function () { applyDefaultKouzaShurui(fieldId, attempt + 1); }, 100);
            }
            return;
        }

        if (select.dataset.kouzaDefaultApplied) return;   // 処理済みなら何もしない

        // 既に値あり（ユーザー選択・既存レコード）→ 上書きせずフラグ確定
        if (select.value && select.value.trim() !== '') {
            select.dataset.kouzaDefaultApplied = 'true';
            return;
        }

        // 「普通」に一致する option を value / 表示テキスト両面で探す
        let target = null;
        const options = select.options;
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const text = (opt.textContent || '').trim();
            if (opt.value === OPTION_FUTSUU || text === OPTION_FUTSUU
                || (opt.value && opt.value.indexOf(OPTION_FUTSUU) !== -1)
                || text.indexOf(OPTION_FUTSUU) !== -1) {
                target = opt;
                break;
            }
        }

        // option がまだ生成されていない可能性 → 再試行（フラグは立てない）
        if (!target) {
            if (attempt < 10) {
                setTimeout(function () { applyDefaultKouzaShurui(fieldId, attempt + 1); }, 100);
            } else {
                console.warn(`[申請区分制御] 「${OPTION_FUTSUU}」の選択肢が見つかりません: ${fieldId}`);
            }
            return;
        }

        // 「普通」を選択し input/change を発火して Boost! 側の状態へ反映
        target.selected = true;
        select.value = target.value;
        select.dispatchEvent(new Event('input',  { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dataset.kouzaDefaultApplied = 'true'; // 成功後にフラグ確定
    }

    /**
     * FIELDS_SECOND_ACCOUNT（第2口座銀行名 / 口座種類2 / 口座番号2 / 支店名2 /
     * 支店番号2 / 給与金額 / 賞与金額）の表示を更新する。
     * 判定は必ず「申請区分の現在値」と「_2箇所振込の選択状態」だけで行い、
     * フィールドの表示状態（isFieldVisible 相当）は一切参照しない。
     * 呼び出す度に対象フィールド全件へ show/非表示を明示的に設定するため、
     * 前回の表示状態が中途半端に残ることはない。
     */
    function updateSecondAccountVisibility() {
        const isKyuyo = getCurrentShinseiValue() === SHINSEI_KYUYO;
        const show = isKyuyo && isSecondAccountWanted();
        FIELDS_SECOND_ACCOUNT.forEach(function (fieldId) {
            setFieldVisible(fieldId, show);
        });

        // ③口座種類2 表示時に初期値「普通」を設定（初回・未設定時のみ）
        if (show) applyDefaultKouzaShurui(FIELD_KOUZA_SHURUI2);
    }

    /** 申請区分の値に対応する表示ルールを適用する */
    function applyVisibility(value) {
        // 住所変更の場合 / 銀行名（既存ルール）。未定義値はすべて非表示。
        const rule = VISIBILITY_RULES[value] || { [FIELD_JUSHO]: false, [FIELD_GINKO]: false };
        Object.keys(rule).forEach(function (fieldId) {
            setFieldVisible(fieldId, rule[fieldId]);
        });

        // ①口座種類 / 口座番号 / 支店名 / 支店番号 は「給与口座届出」のときのみ表示（銀行名と同条件）
        const isKyuyo = value === SHINSEI_KYUYO;
        FIELDS_KYUYO_KOUZA.forEach(function (fieldId) {
            setFieldVisible(fieldId, isKyuyo);
        });

        // ③口座種類 表示時に初期値「普通」を設定（初回・未設定時のみ）
        if (isKyuyo) applyDefaultKouzaShurui(FIELD_KOUZA_SHURUI);

        // _2箇所振込 は「給与口座届出」のときのみ表示
        setFieldVisible(FIELD_2FURIKOMI, isKyuyo);

        // FIELDS_SECOND_ACCOUNT を _2箇所振込 の状態に応じて反映
        updateSecondAccountVisibility();
    }

    /**
     * 申請区分 select と _2箇所振込 チェックボックスへイベントをバインドし、
     * 現在の申請区分値で表示状態を再適用する。
     * イベントバインドは dataset フラグで一度だけに制限するが、表示再適用
     * （applyVisibility の呼び出し）は毎回必ず行う。これにより、支店名等の
     * 対象フィールドが 申請区分 / _2箇所振込 より後から描画された場合でも、
     * 表示状態が正しく反映される（初期表示時に非表示にし損ねるのを防止）。
     */
    function bindDropdown() {
        const select = document.querySelector(`.bst-field[field-id="${FIELD_SHINSEI}"] select`);

        // 申請区分 select への change イベント（二重バインド防止）
        if (select && !select.dataset.shinseiVisibilityBound) {
            select.dataset.shinseiVisibilityBound = 'true';
            select.addEventListener('change', function () {
                applyVisibility(this.value); // 変更時に即時反映
            });
        }

        // _2箇所振込 チェックボックスへの change イベント（二重バインド防止）
        const secondField = getFieldEl(FIELD_2FURIKOMI);
        if (secondField && !secondField.dataset.secondAccountBound) {
            secondField.dataset.secondAccountBound = 'true';
            secondField.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
                box.addEventListener('change', updateSecondAccountVisibility);
            });
        }

        // 対象フィールドの描画タイミングに関わらず、現在の申請区分値で毎回再適用する
        applyVisibility(select ? select.value : '');
    }

    // 表示制御の対象となる全フィールドID（いずれかが描画されたら再適用する）
    const WATCHED_FIELD_IDS = [FIELD_SHINSEI, FIELD_2FURIKOMI]
        .concat(FIELDS_KYUYO_KOUZA)
        .concat(FIELDS_SECOND_ACCOUNT);

    /** 追加されたノード（またはその子孫）に監視対象フィールドが含まれるか判定する */
    function containsWatchedField(node) {
        const fieldId = node.getAttribute && node.getAttribute('field-id');
        if (WATCHED_FIELD_IDS.indexOf(fieldId) !== -1) return true;
        if (!node.querySelector) return false;
        return WATCHED_FIELD_IDS.some(function (id) {
            return !!node.querySelector(`[field-id="${id}"]`);
        });
    }

    // Boost! Injector フォームの描画完了を MutationObserver で検知
    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (containsWatchedField(node)) {
                    bindDropdown();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ページロード時点で既に描画済みの対象フィールドがあれば即時バインド
    if (WATCHED_FIELD_IDS.some(function (id) { return !!getFieldEl(id); })) {
        bindDropdown();
    }
});
