#include <algorithm>
#include <string>
#include <vector>
int longest_palindrome(const std::string&text){std::string transformed="^";for(char ch:text){transformed+='#';transformed+=ch;}transformed+="#$";std::vector<int>radius(transformed.size());int center=0,right=0,best=0;for(int i=1;i+1<static_cast<int>(transformed.size());++i){if(i<right)radius[i]=std::min(right-i,radius[2*center-i]);while(transformed[i+radius[i]+1]==transformed[i-radius[i]-1])++radius[i];if(i+radius[i]>right){center=i;right=i+radius[i];}best=std::max(best,radius[i]);}return best;}
int main(){return longest_palindrome("abacaba")==7?0:1;}
