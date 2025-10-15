#!/bin/bash
set -e

echo "[ENTRYPOINT] Tempo Bluetooth Scanner Starting..."

# Ensure we're running as root for D-Bus setup
if [ "$(id -u)" != "0" ]; then
    echo "[ENTRYPOINT] ERROR: Must run as root to start D-Bus"
    exit 1
fi

# Start D-Bus system daemon
echo "[ENTRYPOINT] Starting D-Bus daemon..."
mkdir -p /var/run/dbus
rm -f /var/run/dbus/pid /var/run/dbus/system_bus_socket

# Start dbus-daemon
if ! dbus-daemon --system --fork; then
    echo "[ENTRYPOINT] ERROR: Failed to start D-Bus daemon"
    exit 1
fi

# Wait for D-Bus socket to exist
echo "[ENTRYPOINT] Waiting for D-Bus socket..."
for i in {1..10}; do
    if [ -S /var/run/dbus/system_bus_socket ]; then
        echo "[ENTRYPOINT] ✓ D-Bus socket created"
        break
    fi
    sleep 1
done

# Verify D-Bus is working
sleep 1
if dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames > /dev/null 2>&1; then
    echo "[ENTRYPOINT] ✓ D-Bus system bus is ready"
else
    echo "[ENTRYPOINT] ✗ WARNING: D-Bus system bus check failed"
fi

# Start bluetoothd in background
if command -v bluetoothd > /dev/null; then
    echo "[ENTRYPOINT] Starting bluetoothd..."
    bluetoothd &
    sleep 2
    
    # Check if bluetoothd started
    if pgrep -x bluetoothd > /dev/null; then
        echo "[ENTRYPOINT] ✓ bluetoothd started"
    else
        echo "[ENTRYPOINT] ✗ WARNING: bluetoothd may not have started"
    fi
fi

echo "[ENTRYPOINT] Starting bluetooth scanner as user btscanner..."

# Change to app directory and run as btscanner user
cd /app

# Use su instead of gosu if gosu fails
if command -v gosu > /dev/null 2>&1; then
    exec gosu btscanner "$@"
else
    exec su-exec btscanner "$@"
fi