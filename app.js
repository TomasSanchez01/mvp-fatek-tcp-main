'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, '__esModule', { value: true });
var net = require("net");
var express = require('express');
var cors = require('cors');
var mqtt = require('mqtt'); // Importamos mqtt
var app = express();
app.use(cors());
app.use(express.json());
var FatekPLC = /** @class */ (function () {
    function FatekPLC(host, port) {
        if (port === void 0) { port = 500; }
        var _this = this;
        this.client = new net.Socket();
        this.host = host;
        this.port = port;
        this.client.on('connect', function () {
            console.log("\u2705 Conectado al PLC en ".concat(host, ":").concat(port));
            plc.writeRegister('R', '0', 1);
        });
        this.client.on('error', function (err) {
            return console.error('❌ Error de conexión:', err);
        });
        this.client.on('data', function (data) {
            return _this.parseResponse(data.toString('ascii'));
        });
        this.client.on('close', function () { return console.log('🔌 Conexión cerrada.'); });
        setInterval(function () {
            _this.readRegister('R', '0', 4);
        }, 1000);
    }
    FatekPLC.prototype.sendCommand = function (command) {
        if (!this.client.destroyed) {
            var lrc = this.calculateLRC(command);
            var message = "\u0002".concat(command).concat(lrc, "\u0003");
            this.client.write(message, 'ascii');
        }
        else {
            console.error('⚠ Error: No hay conexión con el PLC.');
        }
    };
    FatekPLC.prototype.calculateLRC = function (data) {
        var sum = 0;
        for (var i = 0; i < data.length; i += 2) {
            sum += parseInt(data.substr(i, 2), 16);
        }
        sum = ((sum ^ 0xff) + 1) & 0xff;
        return sum.toString(16).toUpperCase().padStart(2, '0');
    };
    FatekPLC.prototype.writeRegister = function (type, register, value) {
        var stationNo = '01';
        var commandCode = '47';
        var numRegisters = '01';
        var registerAddress = "".concat(type).concat(register.padStart(5, '0'));
        var hexValue = value.toString(16).toUpperCase().padStart(4, '0');
        var command = "".concat(stationNo).concat(commandCode).concat(numRegisters).concat(registerAddress).concat(hexValue);
        this.sendCommand(command);
    };
    FatekPLC.prototype.readRegister = function (type, register, numberOfRegisters) {
        var stationNo = '01';
        var commandCode = '46';
        var numRegisters = numberOfRegisters.toString().padStart(2, '0');
        var registerAddress = "".concat(type).concat(register.padStart(5, '0'));
        var command = "".concat(stationNo).concat(commandCode).concat(numRegisters).concat(registerAddress);
        this.sendCommand(command);
    };
    FatekPLC.prototype.parseResponse = function (response) {
        if (response.length < 6) {
            console.error('⚠ Respuesta incompleta o inválida:', response);
            return;
        }
        if (response.startsWith('\x02'))
            response = response.slice(1);
        if (response.endsWith('\x03'))
            response = response.slice(0, -1);
        var hexPart = response.slice(5, -2);
        var values = [];
        for (var i = 0; i < hexPart.length; i += 4) {
            var hexValue = hexPart.slice(i, i + 4);
            values.push(parseInt(hexValue, 16));
        }
        return values;
    };
    FatekPLC.prototype.connect = function () {
        this.client.connect(this.port, this.host);
    };
    return FatekPLC;
}());
var plc = new FatekPLC('192.168.100.85');
plc.connect();
function publishData() {
    plc.readRegister('R', '20', 7);
    plc.client.once('data', function (data) {
        var values = plc.parseResponse(data.toString('ascii'));
        // Publicamos los datos en el tópico MQTT
        var mqttPayload = {
            cutWires: values[0],
            wiresLast24h: values[1],
            wiresPerMinute: values[2],
            wireMeters: values[3],
            days: values[4],
            hours: values[5],
            minutes: values[6],
        };
        // Configuración MQTT (usando MQTT X)
        var mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
            clientId: 'mqttjs_' + Math.random().toString(16).substr(2, 8),
        });
        mqttClient.on('connect', function () {
            console.log('✅ Conectado al broker MQTT X');
            mqttClient.publish('sensor/data', JSON.stringify(mqttPayload), { qos: 1 }, function (err) {
                if (err) {
                    console.error('❌ Error al publicar en MQTT:', err);
                }
                else {
                    console.log('✅ Datos enviados al broker MQTT');
                }
                mqttClient.end();
            });
        });
        mqttClient.on('error', function (err) {
            console.error('❌ Error en la conexión MQTT:', err);
        });
    });
}
// Publicar datos cada 5 segundos
setInterval(publishData, 5000);
app.post('/reset', function (req, res) {
    plc.writeRegister('R', '4', 1);
    res.json({ message: 'Reset command sent' });
});
app.use(function (req, res, next) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
    next();
});
app.listen(3000, function () {
    return console.log('🚀 Server running on http://localhost:3000');
});
