window.onload = function () {

    document.getElementById("file").addEventListener("change", function (e) {
        const file = e.target.files;
        const reader = new FileReader();
        //ファイルが複数読み込まれた際に、1つめを選択
        reader.readAsDataURL(file[0]);
        //ファイルが読み込めたら
        reader.onload = function () {
            //読み込んだファイルのdataURIをsrcに入れる
            const src = reader.result;
            // dataURIをBinaryStringにしてbinaryに入れる
            const binary = atob(src.split(',')[1]);
            const uint8array = Uint8Array.from(binary.split(""), e => e.charCodeAt(0));
            //console.log(uint8array.length);
            const splitChunk = [];
            //console.log(binary.slice(0,8).split('').map(x=>x.codePointAt(0)));
            //console.log([137,80,78,71,13,10,26,10].map(x=>String.fromCharCode(x)).join(''));
            // JSON.stringifyして結果比較
            if (JSON.stringify(Array.from(uint8array.slice(0, 8))) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10])) {
                console.log('this is PNG file');
            } else {
                console.log('this is not PNG file');
            }
            //drawCanvas(src);
            //console.log(binary.length);
            for (let i = 8; i < uint8array.length; i += splitChunk.slice(-1)[0].chunkLength + 12) {
                //console.log(i);
                splitChunk.push(readChunk(uint8array.slice(i)));
                //console.log(splitChunk.slice(-1)[0].chunkLength+12);
            }

            //圧縮されたデータの取り出し
            console.log(splitChunk);
            //console.log(splitChunk.filter(x=>x.chunkType === 'IDAT'));
            const compressed = splitChunk.filter(x => x.chunkType === 'IDAT')[0].chunkData;
            console.log(compressed);
            const inflate = new Zlib.Inflate(compressed);
            console.log(inflate.decompress());
            if (splitChunk[0].chunkData[8] < 8) {
                console.log(optimizeIDATData(inflate.decompress(), splitChunk[0].chunkData[8]));
            }
            //パレットの利用可否と取り出し
            if (uint8array[25] === 3) {
                console.log('palette');
                const palettecolor = paletteColor(splitChunk.filter(x => x.chunkType === 'PLTE')[0].chunkData);
                console.log(palettecolor);
                const set = new Set(optimizeIDATData(inflate.decompress(), splitChunk[0].chunkData[8]));
                console.log(set);
                //使ってる色のみ取り出し
                for (let i of set) {
                    console.log(palettecolor[i]);
                }
                drawPalette(palettecolor, set);
            } else {
                console.log('not palette');
            }
        };
    }, false);
}

function optimizeIDATData(source, bitdepth) {
    const optimizeData = [];
    for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < 8 / bitdepth; j++) {
            optimizeData.push((source[i] >> bitdepth * j) & (2 ** bitdepth - 1));
        }
    }
    return optimizeData
}

function readChunk(source) {
    const cLength = new Uint32Array(source.slice(0, 4).reverse().buffer)[0];
    const cType = Array.from(source.slice(4, 8), e => String.fromCharCode(e)).join("");
    const cData = source.slice(8, 8 + cLength);
    const cCRC = source.slice(8 + cLength, 12 + cLength);
    console.log({ chunkLength: cLength, chunkType: cType, chunkData: cData, chunkCRC: cCRC });
    return { chunkLength: cLength, chunkType: cType, chunkData: cData, chunkCRC: cCRC }
}

function drawCanvas(source) {
    const canvas = document.getElementById('canvas');
    if (canvas.getContext) {
        const context = canvas.getContext('2d');
        const image = new Image();
        image.src = source;
        image.onload = function () {
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image, 0, 0);
        };
    }
}

function drawPalette(sourcepalette, usecolor) {
    const mag = 4;
    const canvas = document.getElementById('paletteCanvas');
    const context = canvas.getContext('2d');
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            drawPaletteColor(i, j,true);
        }
    }
    const saved_pallete = context.getImageData(0,0,mag*4*16,mag*3*16);
    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left, e.clientY - rect.top];
        [j, i] = [Math.floor(x / (mag * 4)), Math.floor(y / (mag * 3))];
        context.putImageData(saved_pallete,0,0);
        drawPaletteColor(i, j,false);
    }, false);
    function drawPaletteColor(i, j, def) {
        if (usecolor.has(i * 16 + j)) {
            context.fillStyle = def ? 'rgb(128,128,128)':'rgb(255,255,0)';
            context.fillRect(mag * 4 * j, mag * 3 * i, mag * 4, mag * 3);
        }
        context.fillStyle = `rgb(${sourcepalette[i * 16 + j]})`;
        context.fillRect(mag * 4 * j + 1, mag * 3 * i + 1, mag * 4 - 2, mag * 3 - 2);
    }
}

function paletteColor(source) {
    const palette = [];
    for (i = 0; i < source.length / 3; i++) {
        palette.push([source[3 * i], source[3 * i + 1], source[3 * i + 2]]);
    }
    return palette;
}

function hex(s) {
    const result = "";
    for (let i = 0; i < s.length; ++i) {
        const h = ("0" + s.charCodeAt(i).toString(16)).slice(-2);
        result += h;
    }
    return result;
}