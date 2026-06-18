window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 研修報告 フォーム表示制御 (Boost! Injector カスタマイズ)
    //
    //  ① 交通機関   … 値に応じて関連フィールドを表示/非表示
    //  ② ラジオボタン … 「無」のとき 出張日数 を非表示
    //  ③ 支払       … 「無」のとき 別途支払 / 領収書_0 を非表示
    //
    //  ・初期表示時に実行
    //  ・各制御元フィールドの値変更時に即時反映
    //  ・他カスタマイズと競合しないよう独立した名前空間/ガードで実装
    // ============================================================

    const LOG_PREFIX = '[研修報告制御]';

    // 二重実行防止（同一スクリプトが複数回読み込まれた場合の競合回避）
    if (window.__kenshuuHoukokuVisibilityLoaded) {
        console.log(`${LOG_PREFIX} 既に初期化済みのため再実行をスキップ`);
        return;
    }
    window.__kenshuuHoukokuVisibilityLoaded = true;

    // ------------------------------------------------------------
    // フィールドコード定数
    // ------------------------------------------------------------
    const FIELDS = {
        // 制御元フィールド
        TRANSPORT:   '交通機関',
        RADIO:       'ラジオボタン',
        PAYMENT:     '支払',
        // 制御対象フィールド
        ONE_WAY_DISTANCE: '片道距離',
        FARE:             '料金',
        CHECKBOX_0:       'チェックボックス_0',
        SHINKANSEN:       '新幹線',
        CAR_MODEL:        '車種名',
        BUSINESS_DAYS:    '出張日数',
        SEPARATE_PAYMENT: '別途支払',
        RECEIPT_0:        '領収書_0',
    };

    // ------------------------------------------------------------
    // 表示制御ルール
    //   { 制御元の値: [ 非表示にする対象フィールドコード ] }
    //   ルールに無い値（および空値）はすべての対象を表示する。
    // ------------------------------------------------------------

    // ① 交通機関
    const TRANSPORT_TARGETS = [
        FIELDS.ONE_WAY_DISTANCE,
        FIELDS.FARE,
        FIELDS.CHECKBOX_0,
        FIELDS.SHINKANSEN,
        FIELDS.CAR_MODEL,
    ];
    const TRANSPORT_RULES = {
        '社用自動車': [FIELDS.ONE_WAY_DISTANCE, FIELDS.FARE, FIELDS.CHECKBOX_0],
        '自家用車':   [FIELDS.FARE, FIELDS.SHINKANSEN],
        'バス':       [FIELDS.CAR_MODEL, FIELDS.ONE_WAY_DISTANCE, FIELDS.CHECKBOX_0],
        '電車':       [FIELDS.CAR_MODEL, FIELDS.ONE_WAY_DISTANCE, FIELDS.CHECKBOX_0],
        '新幹線':     [FIELDS.CAR_MODEL, FIELDS.ONE_WAY_DISTANCE],
        'その他':     [FIELDS.CAR_MODEL, FIELDS.ONE_WAY_DISTANCE, FIELDS.CHECKBOX_0],
    };

    // ② ラジオボタン
    const RADIO_TARGETS = [FIELDS.BUSINESS_DAYS];
    const RADIO_RULES = {
        '無': [FIELDS.BUSINESS_DAYS],
    };

    // ③ 支払
    const PAYMENT_TARGETS = [FIELDS.SEPARATE_PAYMENT, FIELDS.RECEIPT_0];
    const PAYMENT_RULES = {
        '無': [FIELDS.SEPARATE_PAYMENT, FIELDS.RECEIPT_0],
    };

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
     * 制御元フィールドの現在値を取得する。
     * select / ラジオボタン / チェックボックス いずれの型にも対応。
     * @param {string} fieldCode
     * @returns {string} 取得できない場合は空文字
     */
    function getFieldValue(fieldCode) {
        try {
            const el = getFieldEl(fieldCode);
            if (!el) return '';

            // ドロップダウン
            const select = el.querySelector('select');
            if (select) return (select.value || '').trim();

            // ラジオボタン / チェックボックス（チェック済みの値）
            const checked = el.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked');
            if (checked) {
                // value 属性が無い場合は対応するラベルテキストを参照
                if (checked.value && checked.value !== 'on') return checked.value.trim();
                const id = checked.id;
                if (id) {
                    const label = el.querySelector(`label[for="${id}"]`);
                    if (label) return label.textContent.trim();
                }
                const parentLabel = checked.closest('label');
                if (parentLabel) return parentLabel.textContent.trim();
            }

            // 通常のテキスト入力
            const input = el.querySelector('input[type="text"], input:not([type])');
            if (input) return (input.value || '').trim();

            return '';
        } catch (e) {
            console.error(`${LOG_PREFIX} getFieldValue エラー (${fieldCode}):`, e);
            return '';
        }
    }

    /**
     * 指定フィールドを非表示にする
     * @param {string} fieldCode
     */
    function hideField(fieldCode) {
        try {
            const el = getFieldEl(fieldCode);
            if (!el) {
                console.warn(`${LOG_PREFIX} フィールドが見つかりません: ${fieldCode}`);
                return;
            }
            el.style.setProperty('display', 'none', 'important');
        } catch (e) {
            console.error(`${LOG_PREFIX} hideField エラー (${fieldCode}):`, e);
        }
    }

    /**
     * 指定フィールドを再表示する。
     * 非表示で付与した display:none を確実に解除する。
     * @param {string} fieldCode
     */
    function showField(fieldCode) {
        try {
            const el = getFieldEl(fieldCode);
            if (!el) {
                console.warn(`${LOG_PREFIX} フィールドが見つかりません: ${fieldCode}`);
                return;
            }
            // インラインの display 指定（!important 含む）を解除して元の表示へ戻す
            el.style.removeProperty('display');
            if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
        } catch (e) {
            console.error(`${LOG_PREFIX} showField エラー (${fieldCode}):`, e);
        }
    }

    /**
     * 指定フィールドの表示・非表示を切り替える
     * @param {string} fieldCode
     * @param {boolean} visible true: 表示 / false: 非表示
     */
    function setFieldVisible(fieldCode, visible) {
        if (visible) {
            showField(fieldCode);
        } else {
            hideField(fieldCode);
        }
    }

    /**
     * ルールに基づき対象フィールド群の表示/非表示を適用する
     * @param {string} controlValue  制御元の現在値
     * @param {string[]} allTargets  この制御で扱う全対象フィールド
     * @param {Object} rules         値 → 非表示フィールド配列
     * @param {string} label         ログ用ラベル
     */
    function applyRules(controlValue, allTargets, rules, label) {
        try {
            const hideList = rules[controlValue] || [];
            console.log(`${LOG_PREFIX} ${label} = "${controlValue}" → 非表示: [${hideList.join(', ') || 'なし'}]`);
            allTargets.forEach(function (fieldCode) {
                const shouldShow = hideList.indexOf(fieldCode) === -1;
                setFieldVisible(fieldCode, shouldShow);
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} applyRules エラー (${label}):`, e);
        }
    }

    // ------------------------------------------------------------
    // ① 交通機関 制御
    // ------------------------------------------------------------
    function controlTransport() {
        const value = getFieldValue(FIELDS.TRANSPORT);
        applyRules(value, TRANSPORT_TARGETS, TRANSPORT_RULES, FIELDS.TRANSPORT);
    }

    // ------------------------------------------------------------
    // ② ラジオボタン 制御
    // ------------------------------------------------------------
    function controlRadio() {
        const value = getFieldValue(FIELDS.RADIO);
        applyRules(value, RADIO_TARGETS, RADIO_RULES, FIELDS.RADIO);
    }

    // ------------------------------------------------------------
    // ③ 支払 制御
    // ------------------------------------------------------------
    function controlPayment() {
        const value = getFieldValue(FIELDS.PAYMENT);
        applyRules(value, PAYMENT_TARGETS, PAYMENT_RULES, FIELDS.PAYMENT);
    }

    /**
     * 全制御をまとめて実行する
     */
    function applyAll() {
        controlTransport();
        controlRadio();
        controlPayment();
    }

    // ------------------------------------------------------------
    // イベントバインド（document レベルの委譲）
    //   制御元フィールドのコンテナに直接バインドすると、Boost! Injector が
    //   ラジオボタンの内部DOMを再描画した際にリスナーが失われ、
    //   「無→有」等の再変更を取りこぼす（再表示されない不具合の原因）。
    //   document に一度だけ委譲することで、再描画後も発火し続ける。
    //   change に加え click も拾い、ラジオボタンの選択変更を確実に検知する。
    // ------------------------------------------------------------

    // 制御元フィールドコード → 対応する制御関数
    const CONTROL_HANDLERS = {
        [FIELDS.TRANSPORT]: controlTransport,
        [FIELDS.RADIO]:     controlRadio,
        [FIELDS.PAYMENT]:   controlPayment,
    };

    /**
     * change / click 共通ハンドラ。
     * イベント発生元が制御元フィールド配下かどうかを判定し、該当制御を再実行する。
     * @param {Event} e
     */
    function onControlEvent(e) {
        try {
            const target = e.target;
            if (!target || !target.closest) return;
            const field = target.closest('[field-id]');
            if (!field) return;
            const code = field.getAttribute('field-id');
            const handler = CONTROL_HANDLERS[code];
            if (!handler) return;
            // ラジオ/チェックボックスの :checked 反映後に値を読むため次tickで実行
            setTimeout(handler, 0);
        } catch (err) {
            console.error(`${LOG_PREFIX} onControlEvent エラー:`, err);
        }
    }

    /**
     * document への委譲イベントを一度だけ登録する
     */
    function bindGlobalDelegation() {
        try {
            if (document.documentElement.dataset.kenshuuDelegated) return; // 二重バインド防止
            document.documentElement.dataset.kenshuuDelegated = 'true';

            document.addEventListener('change', onControlEvent, true);
            document.addEventListener('click', onControlEvent, true);
            console.log(`${LOG_PREFIX} document への change/click 委譲を登録`);
        } catch (e) {
            console.error(`${LOG_PREFIX} bindGlobalDelegation エラー:`, e);
        }
    }

    /**
     * 制御元フィールドがすべて描画済みかを判定する
     * @returns {boolean}
     */
    function allControlFieldsRendered() {
        return !!getFieldEl(FIELDS.TRANSPORT)
            && !!getFieldEl(FIELDS.RADIO)
            && !!getFieldEl(FIELDS.PAYMENT);
    }

    // ------------------------------------------------------------
    // 初期化
    // ------------------------------------------------------------
    function initialize() {
        try {
            console.log(`${LOG_PREFIX} 初期化開始`);

            // イベント委譲は描画状況に関わらず先に一度だけ登録する
            bindGlobalDelegation();

            // 既に描画済みであれば初期表示制御を実行
            applyAll();

            // Boost! Injector はフォームを非同期描画するため、
            // フィールド出現や再描画のたびに表示制御を再適用する。
            if (!allControlFieldsRendered()) {
                const observer = new MutationObserver(function () {
                    applyAll();
                    if (allControlFieldsRendered()) {
                        observer.disconnect();
                        console.log(`${LOG_PREFIX} 全フィールド描画完了・監視終了`);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log(`${LOG_PREFIX} MutationObserver 監視開始`);
            } else {
                console.log(`${LOG_PREFIX} 全フィールド描画済み・初期化完了`);
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} initialize エラー:`, e);
        }
    }

    initialize();
});
