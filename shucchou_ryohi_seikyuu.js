window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 出張旅費請求 フォーム表示制御 (Boost! Injector カスタマイズ)
    //
    //  ① 出張手当   … 「国内」のとき 海外日数 / 備考_海外出張手当 を非表示（既定:国内）
    //  ② 交通手段   … 「新幹線」以外のとき EX予約(チェックボックス) を非表示
    //  ③ 仮払金有無 … 「無」のとき 仮払金額 を非表示（既定:無）
    //
    //  ・初期表示時に実行
    //  ・各制御元フィールドの値変更時に即時反映
    //  ・毎回いったん全対象を表示へ戻してから条件に応じて非表示にするため
    //    「非表示になるが再表示されない」不具合は発生しない
    //  ・他カスタマイズと競合しないよう独立した名前空間/ガードで実装
    // ============================================================

    const LOG_PREFIX = '[出張旅費請求制御]';

    // 二重実行防止（同一スクリプトが複数回読み込まれた場合の競合回避）
    if (window.__shucchouRyohiVisibilityLoaded) {
        console.log(`${LOG_PREFIX} 既に初期化済みのため再実行をスキップ`);
        return;
    }
    window.__shucchouRyohiVisibilityLoaded = true;

    // ------------------------------------------------------------
    // フィールドコード定数
    // ------------------------------------------------------------
    const FIELDS = {
        // 制御元フィールド
        ALLOWANCE:  '出張手当',
        TRANSPORT:  '交通手段',
        ADVANCE:    '仮払金有無',
        // 制御対象フィールド
        OVERSEAS_DAYS:    '海外日数',
        OVERSEAS_NOTE:    '備考_海外出張手当',
        EX_RESERVE:       'EX予約',
        ADVANCE_AMOUNT:   '仮払金額',
    };

    // ------------------------------------------------------------
    // 制御対象集合（各制御で扱う全対象フィールド）
    // ------------------------------------------------------------
    const ALLOWANCE_TARGETS = [FIELDS.OVERSEAS_DAYS, FIELDS.OVERSEAS_NOTE];
    const TRANSPORT_TARGETS = [FIELDS.EX_RESERVE];
    const ADVANCE_TARGETS   = [FIELDS.ADVANCE_AMOUNT];

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
     * 表示制御の中核。
     * まず全対象をいったん表示へ戻し、その後に非表示対象だけを隠す。
     * これにより「非表示になるが再表示されない」不具合を防止する。
     * @param {string[]} allTargets  この制御で扱う全対象フィールド
     * @param {string[]} hideList    非表示にする対象フィールド
     * @param {string} label         ログ用ラベル
     * @param {string} value         制御元の現在値（ログ用）
     */
    function applyVisibility(allTargets, hideList, label, value) {
        try {
            console.log(`${LOG_PREFIX} ${label} = "${value}" → 非表示: [${hideList.join(', ') || 'なし'}]`);
            // 1) いったん全対象を表示へ戻す
            allTargets.forEach(function (fieldCode) {
                showField(fieldCode);
            });
            // 2) 条件に該当する対象のみ非表示にする
            hideList.forEach(function (fieldCode) {
                hideField(fieldCode);
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} applyVisibility エラー (${label}):`, e);
        }
    }

    // ------------------------------------------------------------
    // ① 出張手当 制御
    //   国内 → 海外日数 / 備考_海外出張手当 を非表示
    // ------------------------------------------------------------
    function controlAllowance() {
        const value = getFieldValue(FIELDS.ALLOWANCE);
        const hideList = (value === '国内')
            ? [FIELDS.OVERSEAS_DAYS, FIELDS.OVERSEAS_NOTE]
            : [];
        applyVisibility(ALLOWANCE_TARGETS, hideList, FIELDS.ALLOWANCE, value);
    }

    // ------------------------------------------------------------
    // ② 交通手段 制御
    //   新幹線「以外」のとき EX予約 を非表示（新幹線のときのみ表示）
    // ------------------------------------------------------------
    function controlTransport() {
        const value = getFieldValue(FIELDS.TRANSPORT);
        const hideList = (value !== '新幹線')
            ? [FIELDS.EX_RESERVE]
            : [];
        applyVisibility(TRANSPORT_TARGETS, hideList, FIELDS.TRANSPORT, value);
    }

    // ------------------------------------------------------------
    // ③ 仮払金有無 制御
    //   無 → 仮払金額 を非表示
    // ------------------------------------------------------------
    function controlAdvance() {
        const value = getFieldValue(FIELDS.ADVANCE);
        const hideList = (value === '無')
            ? [FIELDS.ADVANCE_AMOUNT]
            : [];
        applyVisibility(ADVANCE_TARGETS, hideList, FIELDS.ADVANCE, value);
    }

    /**
     * 全制御をまとめて実行する
     */
    function applyAll() {
        controlAllowance();
        controlTransport();
        controlAdvance();
    }

    // ------------------------------------------------------------
    // イベントバインド（document レベルの委譲）
    //   制御元フィールドのコンテナに直接バインドすると、Boost! Injector が
    //   ラジオボタン/チェックボックス等の内部DOMを再描画した際にリスナーが
    //   失われ、再変更を取りこぼす（再表示されない不具合の原因）。
    //   document に一度だけ委譲することで、再描画後も発火し続ける。
    //   change に加え click も拾い、選択変更を確実に検知する。
    // ------------------------------------------------------------

    // 制御元フィールドコード → 対応する制御関数
    const CONTROL_HANDLERS = {
        [FIELDS.ALLOWANCE]: controlAllowance,
        [FIELDS.TRANSPORT]: controlTransport,
        [FIELDS.ADVANCE]:   controlAdvance,
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
            if (document.documentElement.dataset.shucchouRyohiDelegated) return; // 二重バインド防止
            document.documentElement.dataset.shucchouRyohiDelegated = 'true';

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
        return !!getFieldEl(FIELDS.ALLOWANCE)
            && !!getFieldEl(FIELDS.TRANSPORT)
            && !!getFieldEl(FIELDS.ADVANCE);
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
