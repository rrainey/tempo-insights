#!/bin/bash
set -e

echo "[ENTRYPOINT] Tempo Bluetooth Scanner Starting..."

# Start D-Bus system daemon
echo "[ENTRYPOINT] Starting D-Bus daemon..."
mkdir -p /var/run/dbus
rm -f /var/run/dbus/pid

# Start dbus-daemon as root (need to be root for system bus)
dbus-daemon --system --fork

# Wait for D-Bus to initialize
sleep 2

# Verify D-Bus is working
if dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames > /dev/null 2>&1; then
    echo "[ENTRYPOINT] ✓ D-Bus system bus is ready"
else
    echo "[ENTRYPOINT] ✗ WARNING: D-Bus system bus check failed"
fi

# Start bluetoothd if needed (optional - host may handle this)
if command -v bluetoothd > /dev/null; then
    echo "[ENTRYPOINT] Starting bluetoothd..."
    bluetoothd &
    sleep 1
fi

echo "[ENTRYPOINT] Starting bluetooth scanner as user btscanner..."

# Execute the main command as btscanner user
exec gosu btscanner "$@"