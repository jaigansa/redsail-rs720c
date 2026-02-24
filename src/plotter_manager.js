const { SerialPort } = require('serialport');

class PlotterManager {
    constructor(io) {
        this.io = io;
        this.plotter = null;
        this.isConnected = false;
        this.isExecutionRunning = false;
        this.isAborted = false;
        this.isPaused = false;
    }

    async listPorts() {
        return await SerialPort.list();
    }

    connect(path, baudRate = 9600, flowControl = 'hardware') {
        if (this.plotter) {
            if (this.plotter.isOpen) this.plotter.close();
            this.plotter.removeAllListeners();
        }

        this.plotter = new SerialPort({
            path: path, 
            baudRate: parseInt(baudRate),
            dataBits: 8, stopBits: 1, parity: 'none',
            rtscts: flowControl === 'hardware',
            xon: flowControl === 'software', xoff: flowControl === 'software',
            autoOpen: true
        }, (err) => {
            if (err) {
                this.isConnected = false;
                this.io.emit('connection-status', false);
            }
        });

        this.plotter.on('open', () => {
            this.isConnected = true;
            this.io.emit('connection-status', true);
            this.plotter.write('IN;\r');
        });

        this.plotter.on('close', () => {
            this.isConnected = false;
            this.io.emit('connection-status', false);
        });

        this.plotter.on('data', (data) => {
            this.io.emit('serial-data', data.toString());
        });
    }

    async executeHpgl(hpglString) {
        if (this.isExecutionRunning) return;
        this.isExecutionRunning = true;
        this.isAborted = false;
        this.isPaused = false;
        this.io.emit('execution-state', true);
        
        const commands = hpglString.split(';').map(c => c.trim()).filter(c => c);
        
        try {
            for (let i = 0; i < commands.length; i++) {
                if (this.isAborted) break;
                while (this.isPaused && !this.isAborted) {
                    await new Promise(r => setTimeout(r, 100));
                }

                const cmd = commands[i] + ';';
                await new Promise((resolve, reject) => {
                    this.plotter.write(cmd + '\r', (err) => {
                        if (err) return reject(err);
                        // Fast but safe delay for grouped commands
                        setTimeout(() => {
                            const progress = Math.round(((i + 1) / commands.length) * 100);
                            this.io.emit('progress', { percent: progress, currentCommand: cmd });
                            resolve();
                        }, 5);
                    });
                });
            }
        } catch (e) {
            this.io.emit('serial-data', `Error: ${e.message}`);
        } finally {
            this.isExecutionRunning = false;
            this.io.emit('execution-state', false);
            this.io.emit('progress', { percent: 100 });
        }
    }

    pause() { this.isPaused = true; this.io.emit('paused', true); }
    resume() { this.isPaused = false; this.io.emit('paused', false); }

    jog(cmd, callback) {
        if (this.isExecutionRunning) return callback(new Error("Busy."));
        if (!this.plotter || !this.plotter.isOpen) return callback(new Error("Plotter not connected."));
        this.plotter.write(cmd + ';\r', (err) => {
            if (err) return callback(err);
            callback(null);
        });
    }

    abort() {
        this.isAborted = true;
        if (this.plotter && this.plotter.isOpen) {
            this.plotter.write('PU;IN;\r');
        }
    }

    resetState() {
        this.isExecutionRunning = false;
        this.isAborted = true;
        this.io.emit('execution-state', false);
    }
}

module.exports = PlotterManager;
