from flask import Flask, render_template, request
import qrcode
from io import BytesIO
import base64

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    qr_image = None
    if request.method == "POST":
        url = request.form["url"]
        img = qrcode.make(url)
        # Guardar la imagen QR en un buffer
        img_byte_arr = BytesIO()
        img.save(img_byte_arr)
        img_byte_arr.seek(0)
        qr_image = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
    return render_template("index.html", qr_image=qr_image)

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
