Ghostlight Second Life Marketplace Bridge
=========================================

This object connects Second Life local chat to an active Ghostlight dashboard bridge.
It requires a working Ghostlight dashboard bridge and a dashboard-generated config line.

What you need
-------------

- A Second Life object containing the Ghostlight Bridge script.
- An active Ghostlight dashboard bridge.
- Your dashboard config line in this format:

  bridgeKey|companionId|channel

Example:

  gsl_live_customerkey123|dante_sølvane|666

The bridge key is private. Do not paste someone else's key into your object.

How to rez or wear the bridge
-----------------------------

1. Rez the bridge object in-world, or wear/attach it if your product package is designed as an attachment.
2. Make sure scripts are allowed on the parcel or attachment point.
3. Open the object contents and confirm the Ghostlight Bridge script is present.

How to paste your config line into Description
----------------------------------------------

1. Right-click the bridge object and choose Edit.
2. On the General tab, find the Description field.
3. Paste your full dashboard config line into Description:

   bridgeKey|companionId|channel

4. Close Edit or press Enter so Second Life saves the Description.
5. Touch the object as the owner. It reloads the Description and reports whether the bridge is ready.

If you do not provide a channel, the bridge defaults to channel 666.

Make sure Running is checked
----------------------------

1. Right-click the object and choose Edit.
2. Open the Contents tab.
3. Double-click the Ghostlight Bridge script.
4. Make sure the Running checkbox is checked.
5. If needed, click Reset, save, then close the script window.

Testing
-------

After the object says it is ready, type this in nearby chat:

  /666 hello

If your config line uses a different channel, replace 666 with your channel number.
The companion reply is sent privately to the speaker with llRegionSayTo, so nearby avatars should not see the reply in public chat.

Troubleshooting
---------------

Missing config:
- The object Description is blank or still says PASTE_CONFIG_LINE_HERE.
- Paste the dashboard config line into the object Description, then touch the object as owner.

Bad config:
- The Description must use this exact format:

  bridgeKey|companionId|channel

- bridgeKey and companionId are required.
- channel is optional and defaults to 666.

401 HTTP error:
- The bridge key or token is invalid, expired, copied incorrectly, or does not match an active dashboard bridge.
- Generate or copy the config line again from your Ghostlight dashboard.

404 HTTP error:
- The service URL or route is not reachable.
- This Marketplace script uses the production endpoint hardcoded by Ghostlight. If 404 continues, check Ghostlight service status or contact support.

500 HTTP error:
- The Ghostlight service hit a server-side error.
- Try again after a moment. If it continues, contact support with the time, region name, and companionId.

Empty reply warning:
- The service accepted the request but returned no visible reply.
- Try a simple test message such as /666 hello.
- Confirm the companion is active in the Ghostlight dashboard.

Important safety notes
----------------------

- The script does not include any hardcoded customer bridge key.
- The script reads only the bridge config from the object Description.
- The script does not store memories, prompts, people lists, object lists, or chat history.
- Keep your bridge key private. Anyone with your key may be able to use your bridge.
