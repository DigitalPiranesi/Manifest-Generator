import requests
import json
from bs4 import BeautifulSoup

index = 0
output = ''
blacklist = [
    'html',
    'head',
    'style'
]
while index < 8000:
    result = index + 200
    url = 'https://scalar.usc.edu/works/piranesidigitalproject/rdf/instancesof/content?format=json&rec=1&ref=1&start=' + str(index) + '&results=' + str(result)
    req = requests.get(url)
    html_page = req.content

    soup = BeautifulSoup(html_page, 'html.parser')
    string = soup.find_all(string=True)

    set([t.parent.name for t in string])

    for t in string:
        if t.parent.name not in blacklist:
            output += '{} '.format(t)

    index += 100

with open('data/scalar_data/test.json', 'w') as outfile:
    outfile.write(output)