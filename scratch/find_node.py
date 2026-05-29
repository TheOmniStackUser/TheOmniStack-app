import os
import sys

def find_node():
    search_dirs = [
        os.path.expanduser("~/.nvm"),
        os.path.expanduser("~/.fnm"),
        os.path.expanduser("~/.asdf"),
        os.path.expanduser("~/.npm"),
        os.path.expanduser("~/.volta"),
        os.path.expanduser("~/Library"),
        "/usr/local",
        "/opt",
    ]
    
    found = []
    for base in search_dirs:
        if not os.path.exists(base):
            continue
        for root, dirs, files in os.walk(base):
            if "node" in files:
                node_path = os.path.join(root, "node")
                if os.access(node_path, os.X_OK):
                    found.append(node_path)
            # Stop deep traversal in some folders to speed up
            if len(found) > 10:
                break
    return found

if __name__ == "__main__":
    paths = find_node()
    if paths:
        print("Found node executables:")
        for p in paths:
            print(p)
    else:
        print("No node executable found.")
