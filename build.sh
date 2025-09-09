#!/bin/bash

echo "Building static site with Docker..."
docker run --rm -v ${PWD}:/docs squidfunk/mkdocs-material build
echo "Build complete! Site available in ./site/"