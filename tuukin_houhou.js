window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 通勤手段 フォーム表示制御 (Boost! Injector カスタマイズ)
    //
    //  通勤手段（チェックボックス・複数選択可）の選択値に応じて
    //  車両関連フィールドを表示/非表示にする。
    //
    //  ・初期表示時に実行
    //  ・通勤手段の変更時に即時反映
    //  ・複数選択を考慮し、非表示条件に一致する項目が1つでも含まれれば非表示
    //  ・毎回いったん全対象を表示へ戻してから条件に応じて非表示にするため
    //    「非表示になるが再表示されない」不具合は発生しない
    //  ・他カスタマイズと競合しないよう独立した名前空間/ガードで実装
    // ============================================================

    const LOG_PREFIX = '[通勤手段制御]';

    // 二重実行防止（同一スクリプトが複数回読み込まれた場合の競合回避）
    if (window.__tuukinHouhouVisibilityLoaded) {
        console.log(`${LOG_PREFIX} 既に初期化済みのため再実行をスキップ`);
        return;
    }
    window.__tuukinHouhouVisibilityLoaded = true;

    // ------------------------------------------------------------
    // フィールドコード定数
    // ------------------------------------------------------------
    const FIELDS = {
        // 制御元フィールド（チェックボックス）
        COMMUTING: '通勤手段',
        // 制御対象フィールド
        MAKER:           'メーカー',
        CAR_NAME:        '車名',
        REG_NUMBER:      '登録番号',
        INSPECTION_DOC:  '車検証添付',
        INSURANCE_DOC:   '保険証券添付',
    };

    // 制御対象集合（この制御で扱う全対象フィールド）
    const COMMUTING_TARGETS = [
        FIELDS.MAKER,
        FIELDS.CAR_NAME,
        FIELDS.REG_NUMBER,
        FIELDS.INSPECTION_DOC,
        FIELDS.INSURANCE_DOC,
    ];

    // ------------------------------------------------------------
    // 表示制御ルール
    //   { 選択値: [ その値が選択されたとき非表示にする対象フィールド ] }
    //   複数選択時は、選択された各値の非表示集合を合算（union）する。
    // ------------------------------------------------------------
    const COMMUTING_HIDE_RULES = {
        '電車':   [FIELDS.MAKER, FIELDS.CAR_NAME, FIELDS.REG_NUMBER, FIELDS.INSPECTION_DOC, FIELDS.INSURANCE_DOC],
        'バス':   [FIELDS.MAKER, FIELDS.CAR_NAME, FIELDS.REG_NUMBER, FIELDS.INSPECTION_DOC, FIELDS.INSURANCE_DOC],
        '徒歩':   [FIELDS.MAKER, FIELDS.CAR_NAME, FIELDS.REG_NUMBER, FIELDS.INSPECTION_DOC, FIELDS.INSURANCE_DOC],
        '自転車': [FIELDS.MAKER, FIELDS.CAR_NAME, FIELDS.REG_NUMBER, FIELDS.INSPECTION_DOC],
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
     * チェックボックスフィールドのチェック済み値を配列で取得する。
     * value 属性が無い/汎用値の場合は対応するラベルテキストを参照する。
     * @param {string} fieldCode
     * @returns {string[]} チェック済みの値の配列（無ければ空配列）
     */
    function getCheckedValues(fieldCode) {
        const values = [];
        try {
            const el = getFieldEl(fieldCode);
            if (!el) return values;

            const checkedList = el.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked');
            checkedList.forEach(function (input) {
                let v = '';
                if (input.value && input.value !== 'on') {
                    v = input.value.trim();
                } else if (input.id) {
                    const label = el.querySelector(`label[for="${input.id}"]`);
                    if (label) v = label.textContent.trim();
                }
                if (!v) {
                    const parentLabel = input.closest('label');
                    if (parentLabel) v = parentLabel.textContent.trim();
                }
                if (v) values.push(v);
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} getCheckedValues エラー (${fieldCode}):`, e);
        }
        return values;
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

    // ------------------------------------------------------------
    // 通勤手段 表示制御
    //   選択された各値の非表示集合を合算し、対象を表示へ戻してから非表示化する。
    // ------------------------------------------------------------
    function updateCommutingVisibility() {
        try {
            const selected = getCheckedValues(FIELDS.COMMUTING);

            // 選択値ごとの非表示集合を合算（union）する
            const hideSet = new Set();
            selected.forEach(function (value) {
                const list = COMMUTING_HIDE_RULES[value];
                if (list) {
                    list.forEach(function (fieldCode) {
                        hideSet.add(fieldCode);
                    });
                }
            });

            console.log(`${LOG_PREFIX} 通勤手段 = [${selected.join(', ') || 'なし'}] → 非表示: [${Array.from(hideSet).join(', ') || 'なし'}]`);

            // 1) いったん全対象を表示へ戻す
            COMMUTING_TARGETS.forEach(function (fieldCode) {
                showField(fieldCode);
            });
            // 2) 条件に該当する対象のみ非表示にする
            hideSet.forEach(function (fieldCode) {
                hideField(fieldCode);
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} updateCommutingVisibility エラー:`, e);
        }
    }

    // ------------------------------------------------------------
    // イベントバインド（document レベルの委譲）
    //   制御元フィールドのコンテナに直接バインドすると、Boost! Injector が
    //   チェックボックスの内部DOMを再描画した際にリスナーが失われ、
    //   再変更を取りこぼす（再表示されない不具合の原因）。
    //   document に一度だけ委譲することで、再描画後も発火し続ける。
    //   change に加え click も拾い、チェック変更を確実に検知する。
    // ------------------------------------------------------------

    /**
     * change / click 共通ハンドラ。
     * イベント発生元が通勤手段フィールド配下かどうかを判定し、制御を再実行する。
     * @param {Event} e
     */
    function onControlEvent(e) {
        try {
            const target = e.target;
            if (!target || !target.closest) return;
            const field = target.closest('[field-id]');
            if (!field) return;
            if (field.getAttribute('field-id') !== FIELDS.COMMUTING) return;
            // チェックボックスの :checked 反映後に値を読むため次tickで実行
            setTimeout(updateCommutingVisibility, 0);
        } catch (err) {
            console.error(`${LOG_PREFIX} onControlEvent エラー:`, err);
        }
    }

    /**
     * document への委譲イベントを一度だけ登録する
     */
    function bindGlobalDelegation() {
        try {
            if (document.documentElement.dataset.tuukinHouhouDelegated) return; // 二重バインド防止
            document.documentElement.dataset.tuukinHouhouDelegated = 'true';

            document.addEventListener('change', onControlEvent, true);
            document.addEventListener('click', onControlEvent, true);
            console.log(`${LOG_PREFIX} document への change/click 委譲を登録`);
        } catch (e) {
            console.error(`${LOG_PREFIX} bindGlobalDelegation エラー:`, e);
        }
    }

    /**
     * 制御元フィールドが描画済みかを判定する
     * @returns {boolean}
     */
    function isControlFieldRendered() {
        return !!getFieldEl(FIELDS.COMMUTING);
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
            updateCommutingVisibility();

            // Boost! Injector はフォームを非同期描画するため、
            // フィールド出現や再描画のたびに表示制御を再適用する。
            if (!isControlFieldRendered()) {
                const observer = new MutationObserver(function () {
                    updateCommutingVisibility();
                    if (isControlFieldRendered()) {
                        observer.disconnect();
                        console.log(`${LOG_PREFIX} フィールド描画完了・監視終了`);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log(`${LOG_PREFIX} MutationObserver 監視開始`);
            } else {
                console.log(`${LOG_PREFIX} フィールド描画済み・初期化完了`);
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} initialize エラー:`, e);
        }
    }

    initialize();
});
