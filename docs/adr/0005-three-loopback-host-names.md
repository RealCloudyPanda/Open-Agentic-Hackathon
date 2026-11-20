# 5. Three loopback host names, not three ports on one host

Status: accepted

Local sites run at `127.0.0.1:5173`, `localhost:5174` and `[::1]:5175`, because the runtime
mirrors BYOK keys into a cookie per host name on loopback and a peer on the same host name
would receive it. This is less obvious than `localhost:5173/5174/5175`, needs IPv6 loopback,
and must be explained in the README, but it is the only way to demonstrate honestly that a
peer never receives the visitor's key.
