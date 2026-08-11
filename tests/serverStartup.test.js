const { spawnSync } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

describe('arranque del servidor', () => {
    test('se corta con NODE_ENV=production y sin JWT_SECRET', () => {
        const resultado = spawnSync('node', [SERVER_PATH], {
            env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' },
            timeout: 5000,
            encoding: 'utf8',
        });

        expect(resultado.status).not.toBe(0);
        expect(resultado.stderr).toMatch(/JWT_SECRET/);
    });
});
