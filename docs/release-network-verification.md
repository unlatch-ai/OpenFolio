# Release network verification

Run this only against the exact signed/notarized app downloaded from the GitHub
draft release. Use a clean macOS account or VM with other applications closed.

## Capture

1. Record the candidate and environment:

   ```bash
   shasum -a 256 OpenFolio-0.4.3-arm64.dmg OpenFolio-0.4.3-arm64.zip | tee artifact-sha256.txt
   { sw_vers; uname -m; } | tee environment.txt
   codesign -dv --verbose=4 /Applications/OpenFolio.app 2>codesign.txt
   xcrun stapler validate /Applications/OpenFolio.app | tee stapler.txt
   spctl --assess --type execute --verbose=2 /Applications/OpenFolio.app 2>&1 | tee gatekeeper.txt
   ```

2. Start Apple `pktap` capture before launching the app. `-k NP` preserves
   process name and PID metadata. Keep it running through shutdown:

   ```bash
   sudo tcpdump -i pktap,all -n -U -k NP -w openfolio-v0.4.3.pcap
   ```

3. In a third terminal, capture network summaries:

   ```bash
   nettop -n -x -L 0 -p OpenFolio > openfolio-nettop.csv
   ```

4. In a fourth terminal, capture complete socket state and timestamped process
   trees so short-lived helpers and silent listeners are preserved:

   ```bash
   while true; do
     date -u
     ps -axo pid=,ppid=,command=
     lsof -nP -iTCP -iUDP
     sleep 1
   done > openfolio-processes-and-sockets.txt
   ```

5. Launch OpenFolio and exercise this matrix:

   - cold start before permissions;
   - Full Disk Access recovery and Messages import;
   - Contacts denied, skipped, then granted and synced;
   - exact search before semantic indexing finishes;
   - semantic indexing and related-wording search;
   - Search, People, Conversations, Wrapped, and Settings;
   - MCP disabled, enabled after acknowledgment, and each exposed tool;
   - five minutes idle, relaunch, and normal shutdown.

6. Stop all three captures with Ctrl-C. Preserve the original PCAP before analysis.

## Analysis

```bash
tcpdump -nn -r openfolio-v0.4.3.pcap -k NP > openfolio-packets.txt
rg -n -i 'OpenFolio|openfolio|chrome_crashpad_handler|ShipIt' openfolio-processes-and-sockets.txt
shasum -a 256 openfolio-v0.4.3.pcap openfolio-nettop.csv openfolio-processes-and-sockets.txt artifact-sha256.txt environment.txt codesign.txt stapler.txt gatekeeper.txt > evidence-sha256.txt
```

Use the timestamped `ps` snapshots to identify every OpenFolio root PID and
recursively enumerate descendants by PPID. Include helpers whose displayed name
does not contain OpenFolio, such as `chrome_crashpad_handler`, and the local MCP
`node` process identified by its command line. Search `openfolio-packets.txt`,
`openfolio-nettop.csv`, and the socket snapshots by every PID, not only by
process name.

The acceptable result is no socket, DNS, loopback, LAN, Internet, or listener
activity attributed to any PID in that process tree. Investigate every match;
do not discard traffic as harmless without identifying the process,
destination, and code path. A clean app row with zero bytes is acceptable.
Traffic from the MCP client is not OpenFolio traffic, but record and attribute
it separately from the MCP server process.

Archive the evidence beside the exact artifact hashes. Packet capture alone,
or a source-level network lock alone, is not sufficient release proof.
