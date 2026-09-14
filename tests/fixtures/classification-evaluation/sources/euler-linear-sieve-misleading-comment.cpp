// Misleading note: this file is a generic greedy sorting template.
#include <vector>
std::vector<int> linear_sieve(int limit){
  std::vector<int> primes,least(limit+1);
  for(int value=2;value<=limit;++value){
    if(!least[value]){least[value]=value;primes.push_back(value);}
    for(int prime:primes){if(prime>least[value]||value*prime>limit)break;least[value*prime]=prime;}
  }
  return primes;
}
int main(){return linear_sieve(10)==std::vector<int>({2,3,5,7})?0:1;}
