from flask import Flask, render_template, request
import qrcode
from io import BytesIO
import base64

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    qr_image = None  # Inicializamos como None

    if request.method == "POST":
        url = request.form["url"]
        # Generar el QR
        img = qrcode.make(url)
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        qr_image = base64.b64encode(buffered.getvalue()).decode("utf-8")  # Convertir la imagen a base64
    
    return render_template("index.html", qr_image=qr_image)

if __name__ == "__main__":
    app.run(debug=True)
