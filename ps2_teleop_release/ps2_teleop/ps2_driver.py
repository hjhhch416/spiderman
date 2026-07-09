#!/usr/bin/env python3
import RPi.GPIO as GPIO
import time

# Button Mask Definitions (Active High after inversion)
SELECT   = 1 << 0
L3       = 1 << 1
R3       = 1 << 2
START    = 1 << 3
UP       = 1 << 4
RIGHT    = 1 << 5
DOWN     = 1 << 6
LEFT     = 1 << 7

L2       = 1 << 8
R2       = 1 << 9
L1       = 1 << 10
R1       = 1 << 11
TRIANGLE = 1 << 12
CIRCLE   = 1 << 13
CROSS    = 1 << 14
SQUARE   = 1 << 15

class PS2Controller:
    def __init__(self, dat_pin=9, cmd_pin=10, att_pin=8, clk_pin=11):
        self.dat_pin = dat_pin
        self.cmd_pin = cmd_pin
        self.att_pin = att_pin
        self.clk_pin = clk_pin
        
        # Configure GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        
        # DAT needs a pull-up resistor (very important for open-collector output of the receiver)
        GPIO.setup(self.dat_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(self.cmd_pin, GPIO.OUT)
        GPIO.setup(self.att_pin, GPIO.OUT)
        GPIO.setup(self.clk_pin, GPIO.OUT)
        
        # Set default outputs
        GPIO.output(self.cmd_pin, GPIO.HIGH)
        GPIO.output(self.att_pin, GPIO.HIGH)
        GPIO.output(self.clk_pin, GPIO.HIGH)
        
        # Controller state variables
        self.buttons = 0      # 16-bit button mask
        self.rx = 127         # Right X (0-255)
        self.ry = 127         # Right Y (0-255)
        self.lx = 127         # Left X (0-255)
        self.ly = 127         # Left Y (0-255)
        
        # Initialize the controller into Analog mode
        self.initialize_controller()

    def _transfer(self, byte_to_send):
        received_byte = 0
        for bit in range(8):
            # Send LSB first
            bit_to_send = (byte_to_send >> bit) & 1
            GPIO.output(self.cmd_pin, bit_to_send)
            
            # Clock falls (LOW)
            GPIO.output(self.clk_pin, GPIO.LOW)
            
            # Sample incoming bit on rising edge transition / low period.
            # No sleep inside this loop to avoid Linux thread scheduling jitter.
            incoming_bit = GPIO.input(self.dat_pin)
            received_byte |= (incoming_bit << bit)
            
            # Clock rises (HIGH)
            GPIO.output(self.clk_pin, GPIO.HIGH)
            
        return received_byte

    def send_command(self, cmd_bytes):
        # CS / ATT goes LOW
        GPIO.output(self.att_pin, GPIO.LOW)
        time.sleep(0.000020)
        
        response = []
        for b in cmd_bytes:
            response.append(self._transfer(b))
            time.sleep(0.000020) # 20us spacer between bytes
            
        # CS / ATT goes HIGH
        GPIO.output(self.att_pin, GPIO.HIGH)
        time.sleep(0.000020)
        return response

    def initialize_controller(self):
        # Attempt to initialize controller in Analog mode up to 5 times
        for attempt in range(5):
            # 1. Enter Configuration Mode
            self.send_command([0x01, 0x43, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
            time.sleep(0.05)
            
            # 2. Set Analog Mode (0x01 = Analog, 0x03 = Lock Mode button on controller)
            self.send_command([0x01, 0x44, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00, 0x00])
            time.sleep(0.05)
            
            # 3. Exit Configuration Mode
            self.send_command([0x01, 0x43, 0x00, 0x00, 0x5A, 0x5A, 0x5A, 0x5A, 0x5A])
            time.sleep(0.05)
            
            # Verify the controller mode
            res = self.read_once()
            if res and len(res) >= 2 and res[1] == 0x73:
                print(f"PS2 Controller successfully initialized in Analog Mode (Attempt {attempt+1})!")
                return
        print("Warning: PS2 Controller failed to enter Analog Mode. It might be operating in Digital Mode.")

    def read_once(self):
        # Read command (0x42)
        return self.send_command([0x01, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

    def update(self):
        res = self.read_once()
        if not res or len(res) < 9:
            return False
        
        # Byte 1 is mode (0x41 = Digital, 0x73 = Analog)
        # Byte 2 is data ready confirmation (0x5A)
        if res[2] != 0x5A:
            return False
            
        # Byte 3 and 4 are button states (Active LOW, 0 = pressed).
        # We combine them, invert so 1 = pressed.
        buttons_raw = (res[4] << 8) | res[3]
        self.buttons = ~buttons_raw & 0xFFFF
        
        # Analogs: Byte 5 (RX), 6 (RY), 7 (LX), 8 (LY)
        self.rx = res[5]
        self.ry = res[6]
        self.lx = res[7]
        self.ly = res[8]
        return True

    def get_button(self, button_mask):
        return (self.buttons & button_mask) != 0

    def get_joysticks(self):
        # Center is 127. Standardize to -1.0 to 1.0.
        # For X-axes (RX, LX): left is negative, right is positive.
        # For Y-axes (RY, LY): up is positive, down is negative (we invert standard PS2 which is up=0, down=255).
        lx_norm = (self.lx - 127) / 128.0
        ly_norm = (127 - self.ly) / 128.0
        rx_norm = (self.rx - 127) / 128.0
        ry_norm = (127 - self.ry) / 128.0
        
        return {
            'lx': lx_norm,
            'ly': ly_norm,
            'rx': rx_norm,
            'ry': ry_norm
        }

    def cleanup(self):
        GPIO.cleanup()
