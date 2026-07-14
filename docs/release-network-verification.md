# Release network verification

Run this only against the exact signed/notarized app downloaded from the GitHub
draft release. Use a clean macOS account or VM with other applications closed.

## Capture

1. Record the candidate and environment:

   ```bash
   shasum -a 256 OpenFolio-0.4.0-arm64.dmg OpenFolio-0.4.0-arm64.zip
   sw_vers
   uname -m
   codesign -dv --verbose=4 /Applications/OpenFolio.app 2>codesign.txt
   xcrun stapler validate /Applications/OpenFolio.app | tee stapler.txt
   spctl --assess --type execute --verbose=2 /Applications/OpenFolio.app 2>&1 | tee gatekeeper.txt
   ```

2. Start Apple `pktap` capture before launching the app. `-k NP` preserves
   process name and PID metadata. Keep it running through shutdown:

   ```bash
   sudo tcpdump -i pktap -n -U -k NP -w openfolio-v0.4.0.pcap
   ```

3. In a second terminal, capture socket/process summaries and process-tree
   snapshots:

   ```bash
   nettop -n -x -L 0 -p OpenFolio > openfolio-nettop.csv
   while true; do date -u; pgrep -alf 'OpenFolio|openfolio'; sleep 1; done > openfolio-processes.txt
   ```

4. Launch OpenFolio and exercise this matrix:

   - cold start before permissions;
   - Full Disk Access recovery and Messages import;
   - Contacts denied, skipped, then granted and synced;
   - exact search before semantic indexing finishes;
   - semantic indexing and related-wording search;
   - Search, People, Conversations, Wrapped, and Settings;
   - MCP disabled, enabled after acknowledgment, and each exposed tool;
   - five minutes idle, relaunch, and normal shutdown.

5. Stop the captures with Ctrl-C. Preserve the original PCAP before analysis.

## Analysis

```bash
tcpdump -nn -r openfolio-v0.4.0.pcap -k NP > openfolio-packets.txt
rg -n -i 'OpenFolio|openfolio' openfolio-packets.txt openfolio-nettop.csv openfolio-processes.txt
lsof -nP -iTCP -iUDP | rg -i 'OpenFolio|openfolio'
shasum -a 256 openfolio-v0.4.0.pcap openfolio-nettop.csv openfolio-processes.txt codesign.txt stapler.txt gatekeeper.txt > evidence-sha256.txt
```

The acceptable result is no socket, DNS, loopback, LAN, Internet, or listener
activity attributed to OpenFolio or any helper. Investigate every match; do not
discard traffic as harmless without identifying the process, destination, and
code path. A clean app row with zero bytes is acceptable. Traffic from the MCP
client is not OpenFolio traffic, but record and attribute it separately.

Archive the evidence beside the exact artifact hashes. Packet capture alone,
or a source-level network lock alone, is not sufficient release proof.
