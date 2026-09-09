const axios = require('axios');

const LOGO_URL = "https://images.bukaolshop.com/hosting/180774/ae392f68e017469539.png";

async function kirimPushNotif(pesanTitle, pesanBody, targetId = null, isExternalId = false) {
    try {
        const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "c7cc2a6a-84b8-4579-9c6b-f4d8077f0f65";
        const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || "";
        const BASE_URL = process.env.BASE_URL || "/";

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { "en": pesanTitle, "id": pesanTitle },
            contents: { "en": pesanBody, "id": pesanBody },
            url: BASE_URL,
            icon: LOGO_URL,
            large_icon: LOGO_URL,
            chrome_web_icon: LOGO_URL
        };

        const cleanTargetId = (targetId && String(targetId).trim() !== "" && String(targetId) !== "undefined") ? String(targetId).trim() : null;

        if (cleanTargetId) {
            if (isExternalId) {
                payload.include_aliases = { external_id: [cleanTargetId] };
                payload.target_channel = "push";
            } else {
                payload.include_subscription_ids = [cleanTargetId];
            }
        } else {
            payload.included_segments = ["Subscribed Users"];
        }

        const response = await axios.post(
            'https://onesignal.com/api/v1/notifications',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Key ${ONESIGNAL_REST_KEY}`
                }
            }
        );

        if (response.data?.warnings?.invalid_external_user_ids) {
            console.log(`ℹ️ [Push Notif] User ${cleanTargetId} menerima notifikasi.`);
        } else {
            console.log("🔔 Push Notification Status:", response.data?.id || "OK");
        }
    } catch (err) {
        console.warn("⚠️ Warning Push Notif:", err.response?.data || err.message);
    }
}

module.exports = kirimPushNotif;

