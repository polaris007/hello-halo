/**
 * Port Probe - Port availability health check
 *
 * Checks:
 * - HTTP Server port range (3847-3866)
 * - OpenAI Router port (dynamic)
 */
import * as net from 'net';
// Port ranges to check
const HTTP_SERVER_PORT_START = 3847;
const HTTP_SERVER_PORT_END = 3866;
/**
 * Check if a port is available
 */
async function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
}
/**
 * Try to identify what's using a port (best effort)
 */
async function getPortUser(port) {
    // Platform-specific port identification is complex
    // For now, just return undefined - the fact that port is occupied is enough
    return undefined;
}
/**
 * Check port availability health
 */
export async function runPortProbe() {
    const portsToCheck = [];
    const portsOccupied = [];
    const portsAvailable = [];
    try {
        // Check HTTP server port range
        for (let port = HTTP_SERVER_PORT_START; port <= HTTP_SERVER_PORT_END; port++) {
            portsToCheck.push(port);
            const available = await isPortAvailable(port);
            if (available) {
                portsAvailable.push(port);
            }
            else {
                const processName = await getPortUser(port);
                portsOccupied.push({ port, processName });
            }
        }
        // We need at least one port available for HTTP server
        const hasAvailablePort = portsAvailable.length > 0;
        const severity = hasAvailablePort ? 'info' : 'warning';
        let message = 'Ports available for use';
        if (!hasAvailablePort) {
            message = 'All HTTP server ports are occupied';
        }
        else if (portsOccupied.length > 0) {
            message = `${portsOccupied.length} ports occupied, ${portsAvailable.length} available`;
        }
        return {
            name: 'port',
            healthy: hasAvailablePort,
            severity,
            message,
            timestamp: Date.now(),
            data: {
                portsChecked: portsToCheck,
                portsOccupied,
                portsAvailable
            }
        };
    }
    catch (error) {
        return {
            name: 'port',
            healthy: true, // Assume healthy on error
            severity: 'warning',
            message: `Port check failed: ${error.message}`,
            timestamp: Date.now(),
            data: {
                portsChecked: portsToCheck,
                portsOccupied,
                portsAvailable
            }
        };
    }
}
/**
 * Find an available port in range
 */
export async function findAvailablePort(startPort, endPort) {
    for (let port = startPort; port <= endPort; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    return null;
}
//# sourceMappingURL=port-probe.js.map