import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class CompanionHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))

        # Extract input test cases
        inputs = "\n".join([case["input"] for case in data["tests"]])

        # Write to in.txt
        with open("in.txt", "w") as f:
            f.write(inputs)

        print("Test cases written to in.txt")

        self.send_response(200)
        self.end_headers()

def run(server_class=HTTPServer, handler_class=CompanionHandler, port=12345):
    server_address = ("", port)
    httpd = server_class(server_address, handler_class)
    print(f"Listening on port {port}...")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
