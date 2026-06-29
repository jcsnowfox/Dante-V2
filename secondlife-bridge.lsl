string API_URL = "https://your-railway-app.up.railway.app/sl/chat";
string BRIDGE_KEY = "put-your-bridge-key-here";
string COMPANION_ID = "put-your-companion-id-here";

integer CHANNEL = 666;
key owner;
key requestId;

sendToCompanion(string text)
{
    string body = llList2Json(JSON_OBJECT, [
        "bridgeKey", BRIDGE_KEY,
        "companionId", COMPANION_ID,
        "avatarKey", (string)owner,
        "avatarName", llKey2Name(owner),
        "region", llGetRegionName(),
        "message", text
    ]);

    requestId = llHTTPRequest(API_URL, [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], body);
}

default
{
    state_entry()
    {
        owner = llGetOwner();
        llListen(CHANNEL, "", owner, "");
        llOwnerSay("Second Life bridge ready. Type /666 your message");
    }

    changed(integer change)
    {
        if (change & CHANGED_OWNER) llResetScript();
    }

    listen(integer channel, string name, key id, string message)
    {
        if (id != owner) return;
        sendToCompanion(message);
    }

    http_response(key id, integer status, list metadata, string body)
    {
        if (id != requestId) return;
        if (status == 200) llOwnerSay(body);
        else llOwnerSay("Bridge error: " + (string)status);
    }
}
