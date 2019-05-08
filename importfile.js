window.onload = function(){

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
        if(JSON.stringify(Array.from(uint8array.slice(0,8))) === JSON.stringify([137,80,78,71,13,10,26,10])){
            console.log('this is PNG file');
        }else{
            console.log('this is not PNG file');
        }
        //drawCanvas(src);
        //console.log(binary.length);
        for(let i = 8;i<uint8array.length;i+=splitChunk.slice(-1)[0].chunkLength+12){
            //console.log(i);
            splitChunk.push(readChunk(uint8array.slice(i)));
            //console.log(splitChunk.slice(-1)[0].chunkLength+12);
        }

        //圧縮されたデータの取り出し
        console.log(splitChunk);
        //console.log(splitChunk.filter(x=>x.chunkType === 'IDAT'));
        const compressed = splitChunk.filter(x=>x.chunkType === 'IDAT')[0].chunkData;
        console.log(compressed);
        const inflate = new Zlib.Inflate(compressed);
        console.log(inflate.decompress());
        //パレットの利用可否と取り出し
        if(uint8array[25] === 3){
            console.log('palette');
            const palettecolor = paletteColor(splitChunk.filter(x=>x.chunkType === 'PLTE')[0].chunkData);
            console.log(palettecolor);
            const set = new Set(inflate.decompress());
            console.log(set);
            //使ってる色のみ取り出し
            for(let i of set){
                console.log(palettecolor[i]);
            }
        }else{
            console.log('not palette');
        }
    };
}, false);
}

function readChunk(source){
    const cLength = new Uint32Array(source.slice(0,4).reverse().buffer)[0];
    const cType = Array.from(source.slice(4,8),e => String.fromCharCode(e)).join("");
    const cData = source.slice(8,8+cLength);
    const cCRC = source.slice(8+cLength,12+cLength);
    console.log({chunkLength : cLength, chunkType : cType, chunkData : cData, chunkCRC:cCRC});
    return {chunkLength : cLength, chunkType : cType, chunkData : cData, chunkCRC:cCRC}
}

function drawCanvas(source) {
    var canvas = document.getElementById('canvas');
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

function paletteColor(source) {
    const palette = [];
    for(i = 0;i<source.length/3;i++){
        palette.push([source[3*i],source[3*i+1],source[3*i+2]]);
    }
    return palette;
}

function hex(s) {
    const result="";
    for(let i=0;i<s.length;++i){
      const h = ("0"+s.charCodeAt(i).toString(16)).slice(-2);
      result += h;
    }
    return result;
}