# Managed HTTP fixture

Node 22 serves `GET /health` with status 200 and `{ "status": "ready" }`.
Other paths return 404. ArcNexus supplies loopback host and port; the process
announces its endpoint as one JSON line and stays in the foreground. No external
services, packages, credentials or provisioning are required.

The `http` gateway declares the `serve` service and `health` HTTP check. A research
assignment can start it, observe readiness, run the check, inspect logs, stop it,
and report evidence without source edits. Qualification setup materializes the compiled
fixture payload and configuration into a clean local Git repository. Run that target;
do not execute the uncompiled fixture source directory as an ArcNexus subproject.
