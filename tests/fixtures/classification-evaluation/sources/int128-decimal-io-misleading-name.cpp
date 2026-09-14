// The filename is an adversarial distractor.
#include <algorithm>
#include <string>
std::string to_decimal(__int128 value){
  bool negative=value<0;if(negative)value=-value;std::string digits;
  do{digits.push_back(static_cast<char>('0'+value%10));value/=10;}while(value);
  if(negative)digits.push_back('-');std::reverse(digits.begin(),digits.end());return digits;
}
__int128 parse_decimal(const std::string& text){__int128 value=0;for(char digit:text)value=value*10+(digit-'0');return value;}
int main(){return to_decimal(parse_decimal("12345678901234567890"))=="12345678901234567890"?0:1;}
