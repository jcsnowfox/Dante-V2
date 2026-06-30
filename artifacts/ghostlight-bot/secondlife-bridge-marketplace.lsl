string API_URL = "https://dante-v2-production.up.railway.app/sl/chat";
string PLACEHOLDER = "PASTE_CONFIG_LINE_HERE";
integer DEFAULT_CHANNEL = 666;

string bridgeKey;
string companionId;
integer chatChannel = 666;
integer listenHandle;
key pendingRequest;
key pendingSpeaker;

integer loadConfig(integer announce)
{
    string desc = llStringTrim(llGetObjectDesc(), STRING_TRIM);
    if (desc == "" || desc == PLACEHOLDER)
    {
        bridgeKey = "";
        companionId = "";
        if (listenHandle) llListenRemove(listenHandle);
        listenHandle = 0;
        if (announce) llOwnerSay("Ghostlight Bridge needs your dashboard config line. Paste it into this object's Description.");
        return FALSE;
    }

    list parts = llParseStringKeepNulls(desc, ["|"], []);
    bridgeKey = llStringTrim(llList2String(parts, 0), STRING_TRIM);
    companionId = llStringTrim(llList2String(parts, 1), STRING_TRIM);
    string channelText = llStringTrim(llList2String(parts, 2), STRING_TRIM);

    if (bridgeKey == "" || companionId == "")
    {
        bridgeKey = "";
        companionId = "";
        if (listenHandle) llListenRemove(listenHandle);
        listenHandle = 0;
        if (announce) llOwnerSay("Ghostlight Bridge bad config. Use: bridgeKey|companionId|channel");
        return FALSE;
    }

    chatChannel = DEFAULT_CHANNEL;
    if (channelText != "") chatChannel = (integer)channelText;
    if (chatChannel == 0) chatChannel = DEFAULT_CHANNEL;

    if (listenHandle) llListenRemove(listenHandle);
    listenHandle = llListen(chatChannel, "", NULL_KEY, "");
    if (announce) llOwnerSay("Ghostlight Bridge ready on /" + (string)chatChannel + ".");
    return TRUE;
}

postChat(key speaker, string name, string msg)
{
    if (bridgeKey == "" || companionId == "")
    {
        llOwnerSay("Ghostlight Bridge needs your dashboard config line. Paste it into this object's Description.");
        return;
    }

    string body = llList2Json(JSON_OBJECT, [
        "bridgeKey", bridgeKey,
        "token", bridgeKey,
        "companionId", companionId,
        "avatarKey", (string)speaker,
        "avatarName", name,
        "region", llGetRegionName(),
        "channel", (string)chatChannel,
        "message", msg
    ]);

    pendingSpeaker = speaker;
    pendingRequest = llHTTPRequest(API_URL, [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], body);
}

default
{
    state_entry()
    {
        loadConfig(TRUE);
    }

    on_rez(integer startParam)
    {
        llResetScript();
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER) llResetScript();
    }

    touch_start(integer count)
    {
        if (llDetectedKey(0) == llGetOwner()) loadConfig(TRUE);
    }

    listen(integer channel, string name, key id, string message)
    {
        postChat(id, name, message);
    }

    http_response(key requestId, integer status, list metadata, string body)
    {
        if (requestId != pendingRequest) return;

        if (status < 200 || status > 299)
        {
            llOwnerSay("Ghostlight Bridge HTTP error status: " + (string)status);
            return;
        }

        body = llStringTrim(body, STRING_TRIM);
        if (body == "")
        {
            llOwnerSay("Ghostlight Bridge empty reply warning.");
            return;
        }

        llRegionSayTo(pendingSpeaker, 0, body);
    }
}
