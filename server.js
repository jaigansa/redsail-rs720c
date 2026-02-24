const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const PlotterManager = require('./src/plotter_manager');
const { toHpgl } = require('./src/hpgl_converter');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const plotterManager = new PlotterManager(io);

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use(express.static('public'));

// Try to connect to default port on startup
plotterManager.connect('/dev/ttyUSB0');

io.on('connection', (socket) => {
    socket.emit('connection-status', plotterManager.isConnected);
    socket.emit('execution-state', plotterManager.isExecutionRunning);
});

app.get('/ports', async (req, res) => {
    try {
        const ports = await plotterManager.listPorts();
        res.json(ports);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/connect', (req, res) => {
    const { path, baudRate, flowControl } = req.body;
    if (!path) return res.status(400).send("Path is required.");
    plotterManager.connect(path, baudRate, flowControl);
    res.sendStatus(200);
});

app.post('/plot', (req, res) => {
    if (plotterManager.isExecutionRunning) return res.status(409).send("Busy.");
    if (!plotterManager.isConnected) return res.status(503).send("Plotter not connected.");
    
    const { paths, ...config } = req.body;
    try {
        const result = toHpgl(paths, config);
        plotterManager.executeHpgl(result.hpgl).catch(err => console.error("Job Error:", err));
        res.json(result.stats);
    } catch (err) {
        res.status(400).send(err.message);
    }
});

app.post('/preview', (req, res) => {
    const { paths, ...config } = req.body;
    try {
        const result = toHpgl(paths, config);
        res.json(result);
    } catch (err) {
        res.status(400).send(err.message);
    }
});

app.post('/jog', (req, res) => {
    plotterManager.jog(req.body.command, (err) => {
        if (err) return res.status(err.message === "Busy." ? 409 : 503).send(err.message);
        res.sendStatus(200);
    });
});

app.post('/pause', (req, res) => {
    plotterManager.pause();
    res.sendStatus(200);
});

app.post('/resume', (req, res) => {
    plotterManager.resume();
    res.sendStatus(200);
});

app.post('/abort', (req, res) => { 
    plotterManager.abort();
    res.sendStatus(200); 
});

app.post('/reset-state', (req, res) => {
    plotterManager.resetState();
    res.sendStatus(200);
});

server.listen(3000, '0.0.0.0', () => console.log('Server: http://localhost:3000'));