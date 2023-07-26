import requests
import json
from bs4 import BeautifulSoup
import time
from datetime import datetime
from http.client import IncompleteRead

now = datetime.now()
filename = now.strftime("%m-%d-%Y-%H-%M")
filename = 'data/scalar_data/' + filename + '.json'
index = 0
output = ''
result = 100
blacklist = [
    'html',
    'head',
    'style'
]
def get_nodes(start, data):
    url = 'https://scalar.usc.edu/works/piranesidigitalproject/rdf/instancesof/content?format=json&rec=1&ref=1&start=' + str(start) + '&results=' + str(result)
    try:
        req = requests.get(url)
    except requests.exceptions.ConnectionError as e:
        print("Remote connection error encountered, finished at node " + str(start))
        write_file(data)
        data = "reset"
        return data
    
    try:
        html_page = req.content
    except IncompleteRead as e:
        html_page = e.partial

    soup = BeautifulSoup(html_page, 'html.parser')
    string = soup.find_all(string=True)

    set([t.parent.name for t in string])

    for t in string:
        if t.parent.name not in blacklist:
            data += '{} '.format(t)
    return data

def write_file(content):
    with open(filename, 'a') as outfile:
        outfile.write(content)

while index < 6700:
    valid = False
    while not valid:
        output = get_nodes(index, output)
        if output == "reset":
            output = ""
            valid = False
            time.sleep(10)
            print("Resuming...")
        else:
            valid = True
    index += 100

write_file(output)