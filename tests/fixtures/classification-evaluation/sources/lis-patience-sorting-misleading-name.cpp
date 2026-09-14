// The filename is an adversarial distractor.
#include <algorithm>
#include <vector>
int lis_length(const std::vector<int>&sequence){std::vector<int>tails;for(int value:sequence){auto position=std::lower_bound(tails.begin(),tails.end(),value);if(position==tails.end())tails.push_back(value);else *position=value;}return tails.size();}
int main(){return lis_length({3,1,2,5,4})==3?0:1;}
