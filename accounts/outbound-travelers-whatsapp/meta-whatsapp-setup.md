# Meta WhatsApp Cloud API Setup Steps

Unlike the Instagram integration that uses ManyChat, this WhatsApp bot connects **directly** to the Meta WhatsApp Cloud API. This means there is no ManyChat monthly fee and no middleman, but the setup happens in the Meta Developer portal.

---

## 1. Meta Developer App Setup
1. Go to [developers.facebook.com](https://developers.facebook.com/) and log in.
2. Click **Create App**. Select **Other** -> **Business** as the app type.
3. Once created, scroll down and add the **WhatsApp** product to your app.
4. Go to **WhatsApp -> API Setup**. Here you will see your temporary access token, Phone Number ID, and WhatsApp Business Account ID.

## 2. Create the Credential in n8n
1. In your n8n dashboard, go to **Credentials** -> **Add Credential**.
2. Search for **WhatsApp API**.
3. Fill in the details:
   - **Access Token**: For production, you must generate a Permanent Access Token (System User token in Meta Business Settings), NOT the temporary 24-hour token.
   - **Phone Number ID**: Paste the Phone Number ID from the Meta Developer dashboard.
   - **WhatsApp Business Account ID**: Paste from the Meta Developer dashboard.
4. Save the credential.

## 3. Webhook Configuration (After Deploying the Workflow)
Once the new n8n WhatsApp workflow is deployed and active:
1. Open the **Webhook** node in your n8n workflow and temporarily change its HTTP Method to **GET**.
2. Go back to your Meta Developer dashboard: **WhatsApp -> Configuration**.
3. Click **Edit** next to Webhook.
4. Paste the n8n Webhook URL (Production URL).
5. For the **Verify Token**, enter a random string (e.g., `outbound_whatsapp_verify_2026`). You do not need to enter this in n8n; n8n accepts any token in our setup.
6. Click **Verify and Save**. Meta will send a GET request, and n8n will process it. *(Note: If Meta requires `hub.challenge` to be returned in plain text, you may need to temporarily add a 'Respond to Webhook' node returning `{{ $json.query['hub.challenge'] }}` for the initial verification)*.
7. **CRITICAL:** Once verified, change the Webhook node's HTTP Method back to **POST** and activate the workflow.
8. Finally, click **Manage** under Webhook fields and subscribe to **messages**.

## 4. Google Sheets Setup
- We are using the exact same `leads_v2` sheet as the Instagram bot.
- The `Lookup existing lead` node will now search for the user's WhatsApp number in the `whatsapp_number` column instead of the `ig_user_id` column.

## 5. Test
- Send a WhatsApp message to your business number from a personal phone.
- The workflow should trigger, extract your message, use the Google Sheet to remember your previous fields, and reply correctly.
