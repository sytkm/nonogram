let g_selectcolor = 0;
const g_drawarray = [];
const g_csc = 10;
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
            const pngwidth = new Uint32Array(splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData.slice(0, 4).reverse().buffer)[0];
            const pngheight = new Uint32Array(splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData.slice(4, 8).reverse().buffer)[0];
            console.log(pngwidth,pngheight);
            const bitdepth = splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData[8];
            const colortype = splitChunk.filter(x => x.chunkType === 'IHDR')[0].chunkData[9];
            const compressed = splitChunk.filter(x => x.chunkType === 'IDAT')[0].chunkData;
            console.log(compressed);
            const IDATdata = new Zlib.Inflate(compressed).decompress();
            const tRNSdata = splitChunk.filter(x => x.chunkType === 'tRNS')[0].chunkData[0];
            console.log(tRNSdata);
            const pngarray = makePNGarray(IDATdata, pngwidth,pngheight,bitdepth);
            for(let i = 0;i<pngarray.length;i++){
                const row = [];
                for(let j = 0;j<pngarray[i].length;j++){
                    row.push(tRNSdata);
                }
                g_drawarray.push(row);
            }
            console.log(pngarray);

            //パレットの利用可否と取り出し
            if (colortype === 3) {
                console.log('palette');
                const pngpalettecolor = paletteColor(splitChunk.filter(x => x.chunkType === 'PLTE')[0].chunkData);
                g_selectcolor = tRNSdata;
                console.log(pngpalettecolor);
                const pngpalettecolorset = new Set(Array.prototype.concat.apply([],pngarray));
                console.log(pngpalettecolorset);
                //使ってる色のみ取り出し
                for (let i of pngpalettecolorset) {
                    console.log(pngpalettecolor[i]);
                }
                const canvas = document.getElementById('canvas');
                const numberrow = makeNumber(pngarray,tRNSdata);
                const numbercolumn = makeNumber(transpose(pngarray),tRNSdata);
                canvas.width = pngwidth*g_csc+numberrow[1]*g_csc;
                canvas.height = pngheight*g_csc+numbercolumn[1]*g_csc;
                drawPalette(pngpalettecolor, pngpalettecolorset);
                //drawCanvasfrombinary(canvas,pngarray,pngpalettecolor,tRNSdata,[numberrow[1]*g_csc,numbercolumn[1]*g_csc]);
                drawCanvasfrombinary(canvas,g_drawarray,pngpalettecolor,tRNSdata,[numberrow[1]*g_csc,numbercolumn[1]*g_csc]);
                drawNumberRow(canvas,numberrow[0],pngpalettecolor,numbercolumn[1]*g_csc);
                drawNumberColumn(canvas,numbercolumn[0],pngpalettecolor,numberrow[1]*g_csc)
                document.getElementById('solve').addEventListener("click",function(){
                    drawCanvasfrombinary(canvas,pngarray,pngpalettecolor,tRNSdata,[numberrow[1]*g_csc,numbercolumn[1]*g_csc]);
                });
            } else {
                console.log('not palette');
            }
        };
    }, false);
}

function readChunk(source) {
    const cLength = new Uint32Array(source.slice(0, 4).reverse().buffer)[0];
    const cType = Array.from(source.slice(4, 8), e => String.fromCharCode(e)).join("");
    const cData = source.slice(8, 8 + cLength);
    const cCRC = source.slice(8 + cLength, 12 + cLength);
    console.log({ chunkLength: cLength, chunkType: cType, chunkData: cData, chunkCRC: cCRC });
    return { chunkLength: cLength, chunkType: cType, chunkData: cData, chunkCRC: cCRC }
}

function calcNumber(arr){
    const calculated = [[arr[0],1]];
    for(let i=1;i<arr.length;i++){
        if(calculated.slice(-1)[0][0]===arr[i]){
            calculated.slice(-1)[0][1]++;
        }else{
            calculated.push([arr[i],1]);
        }
    }
    return calculated;
}

function makePNGarray(data,pngwidth,pngheight,bitdepth){
    const PNGarray = [];
    const depthwidth = pngwidth/(8/bitdepth);
    for(let i=0;i<pngheight;i++){
        let row = Array.from(data.slice((depthwidth+1)*i+1,(depthwidth+1)*(i+1)));
        if(bitdepth<8){
            row = optimizeData(row,bitdepth);
        }
        PNGarray.push(row);
    }
    return PNGarray;
}

function optimizeData(source, bitdepth) {
    const optimizeData = [];
    for (let i = 0; i < source.length; i++) {
        for (let j = 0; j < 8 / bitdepth; j++) {
            optimizeData.push((source[i] >> bitdepth * (8/bitdepth - j - 1)) & (2 ** bitdepth - 1));
        }
    }
    return optimizeData;
}

function makeNumber(arr,alpha){
    const numberrowarray = [];
    let maxnumber = 0;
    for (let i = 0; i < arr.length; i++) {
        let calcnum = calcNumber(arr[i]);
        calcnum = calcnum.filter(x=>x[0]!==alpha);
        if(calcnum.length===0){
            calcnum.push([-1,0]);
        }
        numberrowarray.push(calcnum);
        maxnumber = Math.max(maxnumber,calcnum.length);
    }
    console.log(numberrowarray.length);
    return [numberrowarray,maxnumber];
}

function drawNumberRow(canvas,arr,palette,offset){
    const context = canvas.getContext('2d');
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
            drawNumberColorRow(i, j);
        }
    }
    function drawNumberColorRow(i,j){
        if(arr[i][j][0]>=0){
            context.fillStyle = `rgb(${palette[arr[i][j][0]]})`;
            context.fillRect(g_csc*j,g_csc*i+offset,g_csc,g_csc);
            context.strokeStyle = chooseTextColor(...palette[arr[i][j][0]]);
        }else{
            context.strokeStyle = `rgb(0,0,0)`;
        }
        //context.textAlign = "center";
        context.strokeText(`${arr[i][j][1]}`,g_csc*j,g_csc*i+g_csc+offset,g_csc);
    }
}
function drawNumberColumn(canvas,arr,palette,offset){
    const context = canvas.getContext('2d');
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
            drawNumberColorColumn(i, j);
        }
    }
    function drawNumberColorColumn(i,j){
        if(arr[i][j][0]>=0){
            context.fillStyle = `rgb(${palette[arr[i][j][0]]})`;
            context.fillRect(g_csc*i+offset,g_csc*j,g_csc,g_csc);
            context.strokeStyle = chooseTextColor(...palette[arr[i][j][0]]);
        }else{
            context.strokeStyle = `rgb(0,0,0)`;
        }
        //context.textAlign = "center";
        context.strokeText(`${arr[i][j][1]}`,g_csc*i+offset,g_csc*j+g_csc,g_csc);
    }
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

function drawCanvasfrombinary(canvas,arr,palette,alpha,offset){
    const context = canvas.getContext('2d');

    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[0].length; j++) {
            drawColor(i, j);
        }
    }

    canvas.addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        let i, j, x, y;
        [x, y] = [e.clientX - rect.left - offset[0], e.clientY - rect.top - offset[1]];
        [j, i] = [Math.floor(x / g_csc), Math.floor(y / g_csc)];
        drawSelectColor(i, j);
        g_drawarray[i][j]=g_selectcolor;
    }, false);

    function drawColor(i,j){
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0]+g_csc*j,offset[1]+g_csc*i,g_csc,g_csc);
        context.fillStyle = `rgb(${palette[arr[i][j]]})`;
        if(arr[i][j]===alpha){
            context.fillStyle = `rgb(255,255,255)`;
        }
        context.fillRect(offset[0]+g_csc*j+1,offset[1]+g_csc*i+1,g_csc-2,g_csc-2);
    }
    function drawSelectColor(i,j){
        context.fillStyle = `rgb(0,0,0)`;
        context.fillRect(offset[0]+g_csc*j,offset[1]+g_csc*i,g_csc,g_csc);
        context.fillStyle = `rgb(${palette[g_selectcolor]})`;
        context.fillRect(offset[0]+g_csc*j+1,offset[1]+g_csc*i+1,g_csc-2,g_csc-2);
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
        if(!def){
                g_selectcolor = i * 16 + j;
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


function chooseTextColor(red, green, blue) {
    // sRGB を RGB に変換し、背景色の相対輝度を求める
    const toRgbItem = item => {
      const i = item / 255
      return i <= 0.03928 ? i / 12.92 : Math.pow((i + 0.055) / 1.055, 2.4)
    }
    const R = toRgbItem(red)
    const G = toRgbItem(green)
    const B = toRgbItem(blue)
    const Lbg = 0.2126 * R + 0.7152 * G + 0.0722 * B
   
    // 白と黒の相対輝度。定義からそれぞれ 1 と 0 になる。
    const Lw = 1
    const Lb = 0
   
    // 白と背景色のコントラスト比、黒と背景色のコントラスト比を
    // それぞれ求める。
    const Cw = (Lw + 0.05) / (Lbg + 0.05)
    const Cb = (Lbg + 0.05) / (Lb + 0.05)
   
    // コントラスト比が大きい方を文字色として返す。
    return Cw < Cb ? 'black' : 'white'
  }
  
function transpose(arr){
    return arr[0].map((_, c) => arr.map(r => r[c]))
}



function hex(s) {
    const result = "";
    for (let i = 0; i < s.length; ++i) {
        const h = ("0" + s.charCodeAt(i).toString(16)).slice(-2);
        result += h;
    }
    return result;
}