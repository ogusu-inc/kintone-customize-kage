window.addEventListener('load', function () {
    'use strict';

    // ============================================================
    // 結婚祝い フォーム表示制御 (Boost! Injector カスタマイズ)
    //
    //  ドロップダウン = 「実施しない」/「未定」のとき
    //    日時 / 文字列__1行_ を非表示にする。
    //  それ以外の選択値では表示する。
    //
    //  ・初期表示時に実行
    //  ・ドロップダウン変更時に即時反映
    //  ・毎回いったん全対象を表示へ戻してから条件に応じて非表示にするため
    //    「非表示になるが再表示されない」不具合は発生しない
    //  ・他カスタマイズと競合しないよう独立した名前空間/ガードで実装
    // ============================================================

    const LOG_PREFIX = '[結婚祝い制御]';

    // 二重実行防止（同一スクリプトが複数回読み込まれた場合の競合回避）
    if (window.__kekkonIwaiVisibilityLoaded) {
        console.log(`${LOG_PREFIX} 既に初期化済みのため再実行をスキップ`);
        return;
    }
    window.__kekkonIwaiVisibilityLoaded = true;

    // ------------------------------------------------------------
    // フィールドコード定数
    // ------------------------------------------------------------
    const FIELDS = {
        // 制御元フィールド
        DROPDOWN: 'ドロップダウン',
        // 制御対象フィールド
        DATETIME:   '日時',
        TEXT_LINE:  '文字列__1行_',
    };

    // 制御対象集合（この制御で扱う全対象フィールド）
    const TARGETS = [FIELDS.DATETIME, FIELDS.TEXT_LINE];

    // 非表示にする選択値（この値のとき TARGETS を全て非表示）
    const HIDE_VALUES = ['実施しない', '未定'];

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

    // ------------------------------------------------------------
    // ドロップダウン 表示制御（要件の中核関数）
    //   まず全対象を表示へ戻し、その後に非表示対象だけを隠す。
    //   これにより「非表示になるが再表示されない」不具合を防止する。
    // ------------------------------------------------------------
    function updateVisibility() {
        try {
            const value = getFieldValue(FIELDS.DROPDOWN);
            const shouldHide = HIDE_VALUES.indexOf(value) !== -1;
            const hideList = shouldHide ? TARGETS.slice() : [];

            console.log(`${LOG_PREFIX} ドロップダウン = "${value}" → 非表示: [${hideList.join(', ') || 'なし'}]`);

            // 1) いったん全対象を表示へ戻す
            TARGETS.forEach(function (fieldCode) {
                showField(fieldCode);
            });
            // 2) 条件に該当する場合のみ非表示にする
            hideList.forEach(function (fieldCode) {
                hideField(fieldCode);
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} updateVisibility エラー:`, e);
        }
    }

    // ------------------------------------------------------------
    // イベントバインド（document レベルの委譲）
    //   制御元フィールドのコンテナに直接バインドすると、Boost! Injector が
    //   内部DOMを再描画した際にリスナーが失われ、再変更を取りこぼす
    //   （再表示されない不具合の原因）。
    //   document に一度だけ委譲することで、再描画後も発火し続ける。
    //   change に加え click も拾い、選択変更を確実に検知する。
    // ------------------------------------------------------------

    /**
     * change / click 共通ハンドラ。
     * イベント発生元がドロップダウンフィールド配下かどうかを判定し、制御を再実行する。
     * @param {Event} e
     */
    function onControlEvent(e) {
        try {
            const target = e.target;
            if (!target || !target.closest) return;
            const field = target.closest('[field-id]');
            if (!field) return;
            if (field.getAttribute('field-id') !== FIELDS.DROPDOWN) return;
            // 値反映後に読むため次tickで実行
            setTimeout(updateVisibility, 0);
        } catch (err) {
            console.error(`${LOG_PREFIX} onControlEvent エラー:`, err);
        }
    }

    /**
     * document への委譲イベントを一度だけ登録する
     */
    function bindGlobalDelegation() {
        try {
            if (document.documentElement.dataset.kekkonIwaiDelegated) return; // 二重バインド防止
            document.documentElement.dataset.kekkonIwaiDelegated = 'true';

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
        return !!getFieldEl(FIELDS.DROPDOWN);
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
            updateVisibility();

            // Boost! Injector はフォームを非同期描画するため、
            // フィールド出現や再描画のたびに表示制御を再適用する。
            if (!isControlFieldRendered()) {
                const observer = new MutationObserver(function () {
                    updateVisibility();
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
