'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
import * as net from 'net';
var express = require('express');
var cors = require('cors');
var mqtt = require('mqtt'); // Importamos mqtt
var app = express();
app.use(cors());
app.use(express.json());

class FatekPLC {
  client: net.Socket;
  private host: string;
  private port: number;

  constructor(host: string, port: number = 500) {
    this.client = new net.Socket();
    this.host = host;
    this.port = port;

    this.client.on('connect', () => {
      console.log(`✅ Conectado al PLC en ${host}:${port}`);
      plc.writeRegister('R', '0', 1);
    });
    this.client.on('error', (err: Error) =>
      console.error('❌ Error de conexión:', err)
    );
    this.client.on('data', (data: Buffer) =>
      this.parseResponse(data.toString('ascii'))
    );
    this.client.on('close', () => console.log('🔌 Conexión cerrada.'));
    setInterval(() => {
      this.readRegister('R', '0', 4);
    }, 1000);
  }

  sendCommand(command: string): void {
    if (!this.client.destroyed) {
      const lrc = this.calculateLRC(command);
      const message = `\x02${command}${lrc}\x03`;
      this.client.write(message, 'ascii');
    } else {
      console.error('⚠ Error: No hay conexión con el PLC.');
    }
  }

  private calculateLRC(data: string): string {
    let sum = 0;
    for (let i = 0; i < data.length; i += 2) {
      sum += parseInt(data.substr(i, 2), 16);
    }
    sum = ((sum ^ 0xff) + 1) & 0xff;
    return sum.toString(16).toUpperCase().padStart(2, '0');
  }

  writeRegister(type: 'R' | 'M', register: string, value: number): void {
    const stationNo = '01';
    const commandCode = '47';
    const numRegisters = '01';
    const registerAddress = `${type}${register.padStart(5, '0')}`;
    const hexValue = value.toString(16).toUpperCase().padStart(4, '0');
    const command = `${stationNo}${commandCode}${numRegisters}${registerAddress}${hexValue}`;
    this.sendCommand(command);
  }

  readRegister(
    type: 'R' | 'M',
    register: string,
    numberOfRegisters: number
  ): void {
    const stationNo = '01';
    const commandCode = '46';
    const numRegisters = numberOfRegisters.toString().padStart(2, '0');
    const registerAddress = `${type}${register.padStart(5, '0')}`;
    const command = `${stationNo}${commandCode}${numRegisters}${registerAddress}`;
    this.sendCommand(command);
  }

  parseResponse(response: string): string[] {
    if (response.length < 6) {
      console.error('⚠ Respuesta incompleta o inválida:', response);
      return;
    }

    if (response.startsWith('\x02')) response = response.slice(1);
    if (response.endsWith('\x03')) response = response.slice(0, -1);

    const hexPart = response.slice(5, -2);
    const values = [];
    for (let i = 0; i < hexPart.length; i += 4) {
      const hexValue = hexPart.slice(i, i + 4);
      values.push(parseInt(hexValue, 16));
    }
    return values;
  }

  connect(): void {
    this.client.connect(this.port, this.host);
  }
}

var plc = new FatekPLC('192.168.100.85');
plc.connect();

function publishData() {
  plc.readRegister('R', '20', 12);
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
      status: values[7],
      timeOffMachine: values[8],
      emergencyStop: values[9],
      alarmMuñeco: values[10],
      alarmTraccionador: values[11],
    };

    // Configuración MQTT (usando MQTT X)
    var mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt', {
      clientId: 'mqttjs_' + Math.random().toString(16).substr(2, 8),
    });

    mqttClient.on('connect', function () {
      console.log('✅ Conectado al broker MQTT X');
      mqttClient.publish(
        'sensor/data',
        JSON.stringify(mqttPayload),
        { qos: 1 },
        function (err) {
          if (err) {
            console.error('❌ Error al publicar en MQTT:', err);
          } else {
            console.log('✅ Datos enviados al broker MQTT');
          }
          mqttClient.end();
        }
      );
    });

    mqttClient.on('error', function (err) {
      console.error('❌ Error en la conexión MQTT:', err);
    });
  });
}

// Publicar datos cada 10 segundos
setInterval(publishData, 10000);

app.use(function (req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'"
  );
  next();
});

app.listen(3000, function () {
  return console.log('🚀 Server running on http://localhost:3000');
});
