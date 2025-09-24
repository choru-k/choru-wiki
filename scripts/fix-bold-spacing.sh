#!/bin/bash

# Script to fix bold formatting spacing issues in Korean markdown files
# This script adds proper spacing around **bold** text when adjacent to Korean characters

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
FIXED_FILES=0
TOTAL_FIXES=0

echo -e "${BLUE}🔧 Bold Text Spacing Fixer for Korean Markdown Files${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to fix bold spacing in a file
fix_bold_spacing() {
    local file="$1"
    local temp_file=$(mktemp)
    local fixes_made=0
    
    # Copy original file to temp
    cp "$file" "$temp_file"
    
    # Pattern 1: Korean character followed immediately by **bold** (한글**bold**)
    # Add space before **
    sed -i '' 's/\([가-힣]\)\(\*\*[^*]*\*\*\)/\1 \2/g' "$temp_file" 2>/dev/null || sed -i 's/\([가-힣]\)\(\*\*[^*]*\*\*\)/\1 \2/g' "$temp_file"
    
    # Pattern 2: **bold** followed immediately by Korean character (**bold**한글)
    # Add space after **
    sed -i '' 's/\(\*\*[^*]*\*\*\)\([가-힣]\)/\1 \2/g' "$temp_file" 2>/dev/null || sed -i 's/\(\*\*[^*]*\*\*\)\([가-힣]\)/\1 \2/g' "$temp_file"
    
    # Pattern 3: **bold** followed immediately by Korean particles (의, 가, 이, 는, 를, 에, 로, 와, 과, 도, 만, 부터, 까지, 에서, 으로, 에게, 한테, 처럼, 같이, 마다, 조차, 밖에)
    # This is more specific for Korean grammar
    sed -i '' 's/\(\*\*[^*]*\*\*\)\([의가이는를에로와과도만부터까지에서으로에게한테처럼같이마다조차밖에]\)/\1 \2/g' "$temp_file" 2>/dev/null || sed -i 's/\(\*\*[^*]*\*\*\)\([의가이는를에로와과도만부터까지에서으로에게한테처럼같이마다조차밖에]\)/\1 \2/g' "$temp_file"
    
    # Pattern 4: **bold** followed immediately by Korean endings (입니다, 습니다, 했습니다, 됩니다, 합니다, etc.)
    sed -i '' 's/\(\*\*[^*]*\*\*\)\(입니다\|습니다\|했습니다\|됩니다\|합니다\|있습니다\|없습니다\|였습니다\|이었습니다\)/\1 \2/g' "$temp_file" 2>/dev/null || sed -i 's/\(\*\*[^*]*\*\*\)\(입니다\|습니다\|했습니다\|됩니다\|합니다\|있습니다\|없습니다\|였습니다\|이었습니다\)/\1 \2/g' "$temp_file"
    
    # Count differences to see if any fixes were made
    if ! cmp -s "$file" "$temp_file"; then
        fixes_made=$(diff "$file" "$temp_file" 2>/dev/null | grep "^>" | wc -l | tr -d ' ')
        
        # Show what was changed
        echo -e "${GREEN}  ✓ Fixed:${NC} $(basename "$file") (${fixes_made} changes)"
        
        # Show specific changes (first 3 for brevity)
        diff "$file" "$temp_file" 2>/dev/null | grep "^[<>]" | head -6 | while read line; do
            if [[ $line == ">"* ]]; then
                echo -e "    ${GREEN}+${NC} ${line:2}"
            elif [[ $line == "<"* ]]; then
                echo -e "    ${RED}-${NC} ${line:2}"
            fi
        done
        echo ""
        
        # Replace original with fixed version
        mv "$temp_file" "$file"
        echo "$fixes_made"
    else
        # No changes needed
        rm "$temp_file"
        echo "0"
    fi
}

# Function to process files
process_files() {
    local pattern="$1"
    local description="$2"
    
    echo -e "${YELLOW}🔍 Processing: $description${NC}"
    echo ""
    
    local file_count=0
    local fixed_count=0
    local fix_count=0
    
    while IFS= read -r -d '' file; do
        # Skip if not a regular file
        [ -f "$file" ] || continue
        
        file_count=$((file_count + 1))
        TOTAL_FILES=$((TOTAL_FILES + 1))
        
        # Check if file has bold formatting first (optimization)
        if grep -q "\*\*" "$file" 2>/dev/null; then
            fixes=$(fix_bold_spacing "$file")
            if [ "$fixes" -gt 0 ] 2>/dev/null; then
                fixed_count=$((fixed_count + 1))
                fix_count=$((fix_count + fixes))
                FIXED_FILES=$((FIXED_FILES + 1))
                TOTAL_FIXES=$((TOTAL_FIXES + fixes))
            fi
        fi
        
    done < <(find "$pattern" -name "*.md" -type f -print0 2>/dev/null)
    
    if [ $fixed_count -gt 0 ]; then
        echo -e "${GREEN}✅ $description Summary:${NC}"
        echo -e "   Files processed: $file_count"
        echo -e "   Files fixed: $fixed_count"
        echo -e "   Total fixes: $fix_count"
    else
        echo -e "${GREEN}✅ $description: No fixes needed (already properly formatted)${NC}"
        echo -e "   Files processed: $file_count"
    fi
    echo ""
}

# Main execution
main() {
    echo -e "${BLUE}Starting bold text spacing fixes...${NC}"
    echo ""
    
    # Check if we're in the right directory
    if [ ! -d "docs" ]; then
        echo -e "${RED}❌ Error: 'docs' directory not found. Please run this script from the project root.${NC}"
        exit 1
    fi
    
    # Process different sections
    process_files "docs/cs/guide" "CS Guide Documentation"
    process_files "docs/devops" "DevOps Documentation" 
    process_files "docs" "All Other Documentation"
    
    # Final summary
    echo -e "${BLUE}================================================${NC}"
    echo -e "${GREEN}🎉 Bold Text Spacing Fix Complete!${NC}"
    echo -e "${GREEN}📊 Final Summary:${NC}"
    echo -e "   Total files processed: $TOTAL_FILES"
    echo -e "   Files with fixes: $FIXED_FILES"
    echo -e "   Total spacing fixes: $TOTAL_FIXES"
    echo ""
    
    if [ $TOTAL_FIXES -gt 0 ]; then
        echo -e "${YELLOW}💡 Recommendations:${NC}"
        echo -e "   1. Run markdown linting: ${BLUE}npm run lint:check${NC}"
        echo -e "   2. Review changes: ${BLUE}git diff${NC}"
        echo -e "   3. Test rendering in MkDocs preview"
        echo ""
        
        echo -e "${GREEN}✅ All bold text spacing issues have been fixed according to Korean typography standards.${NC}"
    else
        echo -e "${GREEN}✅ All files already have proper bold text spacing!${NC}"
    fi
}

# Run main function
main "$@"