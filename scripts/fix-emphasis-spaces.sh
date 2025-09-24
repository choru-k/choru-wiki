#!/bin/bash

# Script to fix MD037 emphasis spacing issues
# Fixes: "** text**" -> "**text**" and "**text **" -> "**text**"

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

echo -e "${BLUE}🔧 MD037 Emphasis Spacing Fixer${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Function to fix emphasis spacing in a file
fix_emphasis_spacing() {
    local file="$1"
    local temp_file=$(mktemp)
    local fixes_made=0
    
    # Copy original file to temp
    cp "$file" "$temp_file"
    
    # Fix "** text" -> "**text" (space after opening **)
    sed -i '' 's/\*\* \([^*]\)/\*\*\1/g' "$temp_file" 2>/dev/null || sed -i 's/\*\* \([^*]\)/\*\*\1/g' "$temp_file"
    
    # Fix "text **" -> "text**" (space before closing **)
    sed -i '' 's/\([^*]\) \*\*/\1\*\*/g' "$temp_file" 2>/dev/null || sed -i 's/\([^*]\) \*\*/\1\*\*/g' "$temp_file"
    
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
        
        # Check if file has emphasis formatting first (optimization)
        if grep -q "\*\*" "$file" 2>/dev/null; then
            fixes=$(fix_emphasis_spacing "$file")
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
        echo -e "${GREEN}✅ $description: No fixes needed${NC}"
        echo -e "   Files processed: $file_count"
    fi
    echo ""
}

# Main execution
main() {
    echo -e "${BLUE}Starting MD037 emphasis spacing fixes...${NC}"
    echo ""
    
    # Check if we're in the right directory
    if [ ! -d "docs" ]; then
        echo -e "${RED}❌ Error: 'docs' directory not found. Please run this script from the project root.${NC}"
        exit 1
    fi
    
    # Process all documentation
    process_files "docs" "All Documentation"
    
    # Final summary
    echo -e "${BLUE}================================${NC}"
    echo -e "${GREEN}🎉 MD037 Fix Complete!${NC}"
    echo -e "${GREEN}📊 Final Summary:${NC}"
    echo -e "   Total files processed: $TOTAL_FILES"
    echo -e "   Files with fixes: $FIXED_FILES"
    echo -e "   Total spacing fixes: $TOTAL_FIXES"
    echo ""
    
    if [ $TOTAL_FIXES -gt 0 ]; then
        echo -e "${YELLOW}💡 Recommendations:${NC}"
        echo -e "   1. Run markdown linting: ${BLUE}npm run lint:check${NC}"
        echo -e "   2. Review changes: ${BLUE}git diff${NC}"
        echo ""
        
        echo -e "${GREEN}✅ All MD037 emphasis spacing issues have been fixed.${NC}"
    else
        echo -e "${GREEN}✅ All files already have proper emphasis spacing!${NC}"
    fi
}

# Run main function
main "$@"