/*
  Electron / led.py ile uyumlu protokol:
  Seri: "r,g,b,p\n"  (r,g,b: 0-255, p: parlaklık % 0-100)
  Varsayılan 9600 baud (uygulama ile aynı; gerekirse 115200’e çıkarılabilir)
  PWM pinleri: 9=kırmızı, 10=yeşil, 11=mavi (Arduino Uno)
*/
const int PIN_R = 9;
const int PIN_G = 10;
const int PIN_B = 11;

void setup() {
  Serial.begin(9600);
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
}

void loop() {
  if (Serial.available() < 1) return;

  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  int c1 = line.indexOf(',');
  int c2 = line.indexOf(',', c1 + 1);
  int c3 = line.indexOf(',', c2 + 1);
  if (c1 < 0 || c2 < 0 || c3 < 0) return;

  int r = line.substring(0, c1).toInt();
  int g = line.substring(c1 + 1, c2).toInt();
  int b = line.substring(c2 + 1, c3).toInt();
  int p = line.substring(c3 + 1).toInt();

  r = constrain(r, 0, 255);
  g = constrain(g, 0, 255);
  b = constrain(b, 0, 255);
  p = constrain(p, 0, 100);

  long rr = (long)r * p / 100;
  long gg = (long)g * p / 100;
  long bb = (long)b * p / 100;

  analogWrite(PIN_R, (int)rr);
  analogWrite(PIN_G, (int)gg);
  analogWrite(PIN_B, (int)bb);
}
