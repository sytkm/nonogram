window.onload = function(){

document.getElementById("file").addEventListener("change", function (e) {
    let file = e.target.files;
    let reader = new FileReader();
    //ファイルが複数読み込まれた際に、1つめを選択
    reader.readAsDataURL(file[0]);
    //ファイルが読み込めたら
    reader.onload = function () {
        //読み込んだファイルのdataURIをsrcに入れる
        let src = reader.result;
        // dataURIをBinaryStringにしてbinaryに入れる
        let binary = atob(src.split(',')[1]);
        let uint8array = Uint8Array.from(binary.split(""), e => e.charCodeAt(0));
        //console.log(uint8array.length);
        var splitChunk = [];
        //console.log(binary.slice(0,8).split('').map(x=>x.codePointAt(0)));
        //console.log([137,80,78,71,13,10,26,10].map(x=>String.fromCharCode(x)).join(''));
        // tostringして結果比較(怪しい)
        if(JSON.stringify(Array.from(uint8array.slice(0,8))) === JSON.stringify([137,80,78,71,13,10,26,10])){
            console.log('this is PNG file');
        }else{
            console.log('this is not PNG file');
        }
        //drawCanvas(src);
        //paletteColor(binary);
        if(uint8array[25] === 3){
            console.log('palette');
        }else{
            console.log('not palette');
        }
        console.log(binary.length);
        for(let i = 8;i<binary.length;i+=splitChunk.slice(-1)[0].chunkLength+12){
            console.log(i);
            splitChunk.push(readChunk(binary.slice(i)));
            console.log(splitChunk.slice(-1)[0].chunkLength+12);
        }
        console.log(splitChunk);
        console.log(splitChunk.filter(x=>x.chunkType === 'IDAT'));
        var compressed = splitChunk.filter(x=>x.chunkType === 'IDAT')[0].chunkData;
        console.log(compressed);
        var inflate = new Zlib.Inflate(compressed);
        console.log(inflate.decompress());
    };
}, false);
}
function readChunk(source){
    let cLength = source.slice(0,4).split('').map(x=>x.codePointAt(0)).reverse().reduce((acc,cur,idx)=>acc+cur*(256**idx));
    let cType = source.slice(4,8);
    let cData = source.slice(8,8+cLength).split('').map(x=>x.codePointAt(0));
    let cCRC = source.slice(8+cLength,12+cLength).split('').map(x=>x.codePointAt(0));
    console.log({chunkLength : cLength, chunkType : cType, chunkData : cData, chunkCRC:cCRC});
    return {chunkLength : cLength, chunkType : cType, chunkData : cData, chunkCRC:cCRC}

}

function drawCanvas(source) {
    var canvas = document.getElementById('canvas');
    if (canvas.getContext) {
        var context = canvas.getContext('2d');
        var image = new Image();
        image.src = source;
        image.onload = function () {
            canvas.width = image.width;
            canvas.height = image.height;
            context.drawImage(image, 0, 0);
        };
    }
}

function paletteColor(source) {
    var length = -1;
    var iChankType = -1;

}

function hex(s) {
    var result="";
    for(var i=0;i<s.length;++i){
      var h = ("0"+s.charCodeAt(i).toString(16)).slice(-2);
      result += h;
    }
    return result;
}