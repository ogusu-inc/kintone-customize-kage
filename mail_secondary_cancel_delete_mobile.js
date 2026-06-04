(() => {
    'use strict';

    /**
     * 別アプリ（603等）モバイル専用 キャンセル削除
     *
     * OG Mail Connect プラグインが転送元アプリ（410等）で別アプリへレコードを作成した後、
     * その別アプリの編集画面でキャンセルした際に、作成済みレコードを削除する。
     *
     * 背景：
     * Kintoneモバイルアプリはアプリ遷移時にJS文脈を破棄するため、転送元（410）に
     * 適用されたOG Mail Connectのキャンセル処理は別アプリの編集画面では動作しない。
     * そのため、削除機能のみを別アプリ自身に適用する必要がある。
     * （402で動作している mail_assist_mobile.js のキャンセル削除部分を踏襲）
     *
     * 連携キー（OG Mail Connect が sessionStorage に保存する値）：
     *   copiedTo   : このアプリに作成されたレコードID（削除対象）
     *   copiedFrom : 転送元の元レコードID（削除後の戻り先）
     *   fromappID  : 転送元アプリID（削除後の戻り先アプリ）
     */
    kintone.events.on('mobile.app.record.edit.show', (event) => {
        // モバイルv2 編集画面のキャンセルボタン
        const cancelBtn = document.querySelector('.gaia-mobile-v2-app-record-edittoolbar-cancel');

        if (!cancelBtn) {
            return event;
        }

        // キャプチャフェーズで捕捉し、Kintone標準のキャンセル動作より先に処理する
        cancelBtn.addEventListener('click', async (e) => {
            const copiedTo = parseInt(sessionStorage.getItem('copiedTo'));
            const copiedFrom = parseInt(sessionStorage.getItem('copiedFrom'));
            const fromappID = sessionStorage.getItem('fromappID');
            const recordID = event.recordId;
            const appid = kintone.mobile.app.getId();

            // このレコードが OG Mail Connect で作成されたレコードの場合のみ処理
            if (copiedTo === recordID) {
                // すべてのイベント伝播を停止
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                try {
                    // 作成済みレコードを削除（このJSは別アプリ上で動くため appid は常にそのアプリ）
                    await kintone.api(kintone.api.url('/k/v1/records.json', true), 'DELETE', {
                        app: appid,
                        ids: [copiedTo]
                    });

                    // sessionStorageをクリア
                    sessionStorage.removeItem('copiedTo');
                    sessionStorage.removeItem('copiedFrom');
                    sessionStorage.removeItem('fromappID');
                    sessionStorage.removeItem('targetAppId');

                    // 転送元の元レコード詳細画面へ戻る
                    const backAppId = fromappID || appid;
                    location.href = `/k/m/${backAppId}/show?record=${copiedFrom}`;
                } catch (error) {
                    console.error('削除エラー:', error);
                    alert('レコードの削除に失敗しました');
                }
            }
        }, true); // 第3引数 true = キャプチャフェーズ

        return event;
    });
})();
